/* Copyright © 2025 Apeleg Limited. All rights reserved.
 *
 * Permission to use, copy, modify, and distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 * OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */

import { $subtype, $type } from './constants.js';
import findOverlappingParams from './lib/findOverlappingParams.js';
import type { IMediaTypeNegotiationStrategy } from './negotiateMediaTypeFactory.js';
import type { TNormalisedMediaType } from './normaliseMediaType.js';
import { wm } from './utils.js';

/**
 * Factory that produces a memoised function to compute the number of
 * overlapping parameter names between two normalised media type tuples.
 *
 * The factory is generic over two tuple types representing normalised media
 * types: each tuple is expected to be the same shape as `TNormalisedMediaType`.
 *
 * Notes:
 * - This function uses reference equality for caching: the `acceptable` and
 *   `available` arguments are used as keys by identity (===).
 * - Fast path: if either media type has no parameters (second tuple element
 *   has length 0) the function returns 0 immediately.
 *
 * @internal
 * @template TA - readonly normalised media type for "acceptable"
 * @template TB - readonly normalised media type for "available"
 * @returns A memoised function that returns the number of overlapping
 *   parameter names between `acceptable` and `available`.
 */
const findOverlappingParamsCardinalityFactory = <
	TA extends Readonly<TNormalisedMediaType>,
	TB extends Readonly<TNormalisedMediaType>,
>() => {
	const cache: [acceptable: TA, [available: TB, cardinality: number][]][] =
		[];

	return (acceptable: TA, available: TB): number => {
		// Fast path
		if (acceptable[1].length === 0 || available[1].length === 0) {
			return 0;
		}

		let subcache: (typeof cache)[number][1] | undefined;
		for (let i = 0; i < cache.length; i++) {
			if (cache[i][0] === acceptable) {
				subcache = cache[i][1];
				for (let j = 0; j < subcache.length; j++) {
					if (subcache[j][0] === available) {
						return subcache[j][1];
					}
				}
			}
		}

		if (!subcache) {
			subcache = [];
			cache.push([acceptable, subcache]);
		}

		const cardinality = findOverlappingParams(acceptable, available).length;
		subcache.push([available, cardinality]);

		return cardinality;
	};
};

/**
 * Implements the default HTTP content negotiation strategy, ranking candidates
 * according to the rules outlined in RFC 7231 §5.3.2.
 *
 * This function takes pre-parsed and pre-sorted lists of available (server) and
 * acceptable (client) media types and finds the single best match from the
 * available list. The selection process follows a strict, multi-stage ranking
 * algorithm:
 *
 * 1.  **Filtering:** It first identifies all potential matches by comparing
 *     each acceptable media range against all available types. A match can be
 *     an exact type/subtype match, a subtype wildcard match (e.g., `text/*`)
 *     or a full wildcard match (`*` + `/*`).
 * 2.  **Quality Value (`q`):** It retains only the candidates that match the
 *     highest q-value present among all potential matches. All others are
 *     discarded.
 * 3.  **Specificity Tie-Breaking:** If multiple candidates remain, they are
 *     ranked by specificity in the following order of preference:
 *       a. Full type/subtype (e.g., `application/json`) is preferred over
 *          wildcard subtypes.
 *       b. A wildcard subtype (e.g., `text/*`) is preferred over the full
 *          wildcard (`*` + `/*`).
 *       c. The number of matching non-q parameters. A media range with more
 *          matching parameters to an available type is preferred.
 *       d. Server preference. As a final tie-breaker, the original order of the
 *          `availableMediaTypes` array is used, preferring the one that
 *          appeared earliest.
 *
 * @internal
 * @param availableMediaTypes - A readonly array of pre-parsed and normalised
 *   media types supported by the server, in order of server preference.
 * @param acceptableMediaTypes - A readonly array of pre-parsed media types
 *   from the client's `Accept` header, pre-sorted by q-value in descending
 *   order.
 * @param qMap - A map that holds the q-value (weight) for each acceptable
 *   media type, used for efficient lookups.
 * @returns The best-matching normalised media type from the
 *   `parsedAvailableTypes` array, or `null` if no suitable match is found.
 */
const defaultStrategy = ((availableMediaTypes, acceptableMediaTypes, qMap) => {
	const acceptableToAvailableMap = wm<
		(typeof acceptableMediaTypes)[number],
		(typeof availableMediaTypes)[number]
	>();
	const findOverlappingParamsCardinality =
		findOverlappingParamsCardinalityFactory();

	// First pass: remove media types that aren't possible
	const overlappingTypes = acceptableMediaTypes.filter(
		(acceptableMediaType) => {
			const matchingAvailableLit: (typeof availableMediaTypes)[number][] =
				[];
			availableMediaTypes.forEach((availableMediaType) => {
				if (acceptableMediaType[0] === availableMediaType[0]) {
					matchingAvailableLit.push(availableMediaType);
				} else if (
					acceptableMediaType[$subtype] === '*' &&
					acceptableMediaType[$type] === availableMediaType[$type]
				) {
					matchingAvailableLit.push(availableMediaType);
				} else if (
					acceptableMediaType[$type] === '*' &&
					acceptableMediaType[$subtype] === '*'
				) {
					matchingAvailableLit.push(availableMediaType);
				}
			});

			matchingAvailableLit.sort((a, b) => {
				const ca = findOverlappingParamsCardinality(
					acceptableMediaType,
					a,
				);
				const cb = findOverlappingParamsCardinality(
					acceptableMediaType,
					b,
				);

				return cb - ca;
			});

			if (matchingAvailableLit.length) {
				acceptableToAvailableMap.set(
					acceptableMediaType,
					matchingAvailableLit[0],
				);
				return true;
			}

			return false;
		},
	);

	if (overlappingTypes.length === 0) {
		return null;
	}

	// Second pass: keep highest preference only
	const highestQ = qMap.get(overlappingTypes[0])!;
	for (let i = 1; i < overlappingTypes.length; i++) {
		const q = qMap.get(overlappingTypes[i])!;
		if (q !== highestQ) {
			overlappingTypes.splice(i);
			break;
		}
	}

	// Now, find the type with the highest specificity
	overlappingTypes.sort((a, b) => {
		if (a[$type] === '*' && b[$type] !== '*') {
			return 1;
		} else if (a[$type] !== '*' && b[$type] === '*') {
			return -1;
		} else if (a[$subtype] === '*' && b[$subtype] !== '*') {
			return 1;
		} else if (a[$subtype] !== '*' && b[$subtype] === '*') {
			return -1;
		}

		const availableA = acceptableToAvailableMap.get(a)!;
		const availableB = acceptableToAvailableMap.get(b)!;

		const ca = findOverlappingParamsCardinality(a, availableA);
		const cb = findOverlappingParamsCardinality(a, availableB);

		const result = cb - ca;
		if (result !== 0) {
			return result;
		}

		// If everything is equal, prefer server order
		return (
			availableMediaTypes.indexOf(availableA) -
			availableMediaTypes.indexOf(availableB)
		);
	});

	const highestRanked = overlappingTypes[0];
	const availableType = acceptableToAvailableMap.get(highestRanked)!;

	return availableType;
}) satisfies IMediaTypeNegotiationStrategy;

export default defaultStrategy;
