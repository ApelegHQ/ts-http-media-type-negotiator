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
import type { IMediaTypeNegotiationStrategy } from './negotiateMediaTypeFactory.js';
import type { TMediaType } from './parseMediaType.js';
import { wm } from './utils.js';

/**
 * Find parameters that overlap between two media types, excluding the `q`
 * parameter.
 *
 * @internal
 * @param a - Candidate media type (typically from `Accept` header).
 * @param b - Available media type (server-provided).
 * @returns Array of matching `[name, value]` parameter pairs.
 */
const findOverlappingParams = (a: TMediaType, b: TMediaType) => {
	return a[1].filter((aparam) => {
		return (
			aparam[0] !== 'q' &&
			b[1].some((bparam) => {
				return aparam[0] === bparam[0] && aparam[1] === bparam[1];
			})
		);
	});
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
	const map = wm<
		(typeof acceptableMediaTypes)[number],
		(typeof availableMediaTypes)[number]
	>();

	// First pass: remove media types that aren't possible
	const overlappingTypes = acceptableMediaTypes.filter(
		(acceptableMediaType) => {
			const possible: (typeof availableMediaTypes)[number][] = [];
			availableMediaTypes.forEach((availableMediaType) => {
				if (acceptableMediaType[0] === availableMediaType[0]) {
					possible.push(availableMediaType);
				} else if (
					acceptableMediaType[$subtype] === '*' &&
					acceptableMediaType[$type] === availableMediaType[$type]
				) {
					possible.push(availableMediaType);
				} else if (
					acceptableMediaType[$type] === '*' &&
					acceptableMediaType[$subtype] === '*'
				) {
					possible.push(availableMediaType);
				}
			});

			possible.sort((a, b) => {
				const overlappingA = findOverlappingParams(
					acceptableMediaType,
					a,
				).length;
				const overlappingB = findOverlappingParams(
					acceptableMediaType,
					b,
				).length;

				return overlappingB - overlappingA;
			});

			if (possible.length) {
				map.set(acceptableMediaType, possible[0]);
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

		const availableA = map.get(a)!;
		const availableB = map.get(b)!;

		const overlappingA = findOverlappingParams(a, availableA).length;
		const overlappingB = findOverlappingParams(b, availableB).length;

		const result = overlappingB - overlappingA;
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
	const availableType = map.get(highestRanked)!;

	return availableType;
}) satisfies IMediaTypeNegotiationStrategy;

export default defaultStrategy;
