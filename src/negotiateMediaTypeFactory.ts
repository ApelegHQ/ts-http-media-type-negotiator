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
import normaliseMediaType from './normaliseMediaType.js';
import parseAcceptHeader from './parseAcceptHeader.js';
import parseMediaType, { type TMediaType } from './parseMediaType.js';

const QVALUE_REGEX = /^(?:(?:0(?:\.\d{1,3})?)|(?:1(?:\.0{1,3})?))$/;
const DEFAULT_Q = 1000;
const MAX_Q = 1000;
const MIN_Q = 0;

/**
 * Convert a q-value (quality factor) string to a clamped integer weight
 * (0–1000).
 *
 * Q-values follow RFC semantics (0 to 1, up to three decimal places). This
 * module uses integer weights in the range **0..1000** where `1.0` maps to
 * **1000** and `0.5` maps to **500**, &c. Invalid or missing `q` parameters
 * default to **1000**.
 *
 * @internal
 * @param mediaType - Normalised media type tuple (parameters available
 *   at index 1).
 * @returns Integer q weight in the range **0..1000**.
 */
const findQ = (mediaType: TMediaType): number => {
	const qParam = mediaType[1].find((p) => p[0] === 'q');
	if (!qParam || !QVALUE_REGEX.test(qParam[1])) return DEFAULT_Q;

	// "0.5" -> "05" -> "0500", "1" -> "1" -> "1000"
	const digits = qParam[1].replace('.', '');
	const normalised = digits.padEnd(4, '0');
	const qvalue = parseInt(normalised, 10);
	// NaN check
	if (qvalue !== qvalue) return DEFAULT_Q;

	// Clamp in case something failed
	return Math.max(Math.min(MAX_Q, qvalue), MIN_Q);
};

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
 * Create a media type negotiator for a fixed list of available media types.
 *
 * The returned function negotiates an `Accept` header value against the
 * available types and returns the best match (original string from
 * `availableMediaTypes`) or `null` when none match.
 *
 * Matching and ranking rules (summary):
 * - Parse and normalise both available types and `Accept` media-ranges
 *   (normalisation yields lowercased type/subtype and sorted, lowercased
 *   parameter names).
 * - Q-values are extracted and converted to integer weights 0..1000; q=0
 *   entries are ignored.
 * - Accept media-ranges are filtered to those overlapping the server's
 *   available types:
 *     exact type/subtype, type with wildcard subtype (e.g. `text/*`),
 *     or `"*" + "/*"`.
 * - Candidates are restricted to the highest q-value found among overlapping
 *   ranges.
 * - Tie-breakers:
 *   1. Prefer more specific type over wildcards (non-* types/subtypes).
 *   2. Prefer the media-range that shares the most non-q parameters with the
 *      available type.
 *   3. Prefer server order of available types.
 *
 * The negotiator is resilient to a permissive parsing mode which tolerates some
 * non-RFC inputs.
 *
 * @param availableMediaTypes - Array of server-supported media type header
 *   strings, from most preferred to least preferred.
 *   The original strings are preserved and returned on a match.
 * @returns A function that, given an `Accept` header string and optional
 * `permissive` flag, returns the best matching available media type string, or
 * `null` if no match exists. If `accept` is falsy, the first available media
 * type (which is assumed to be the server's most preferred representation) is
 * returned.
 *
 * @example
 * const negotiate = negotiateMediaTypeFactory([
 *   'text/plain; charset=utf-8',
 *   'application/json'
 * ]);
 * negotiate('application/json'); // -> 'application/json'
 * negotiate(
 *   'text/*;q=0.9, application/json;q=0.8'
 * ); // -> 'text/plain; charset=utf-8'
 */
const negotiateMediaTypeFactory = (availableMediaTypes: string[]) => {
	if (availableMediaTypes.length === 0) {
		return () => null;
	}

	const mapToOriginal = new Map<TMediaType, string>();
	const parsedAvailableTypes = availableMediaTypes.map((mediaType) => {
		const value = normaliseMediaType(parseMediaType(mediaType));
		mapToOriginal.set(value, mediaType);
		return value;
	});

	return (accept?: string | null | undefined, permissive?: boolean) => {
		if (!accept) {
			return availableMediaTypes[0];
		}

		const qMap = new WeakMap<TMediaType, number>();

		const parsedAcceptableTypes = parseAcceptHeader(
			accept,
			permissive,
			false,
		)
			.map((type) => {
				const parsed = parseMediaType(type, permissive);
				const normalised = normaliseMediaType(parsed);
				const q = findQ(normalised);
				if (q === 0) return;
				qMap.set(normalised, q);

				return normalised;
			})
			.filter(
				Boolean as unknown as (
					x: TMediaType | undefined,
				) => x is TMediaType,
			)
			.sort((a, b) => {
				const qa = qMap.get(a!)!;
				const qb = qMap.get(b!)!;

				return qb - qa;
			}) as TMediaType[];

		const map = new WeakMap<
			TMediaType,
			(typeof parsedAvailableTypes)[number]
		>();

		// First pass: remove media types that aren't possible
		const overlappingTypes = parsedAcceptableTypes.filter(
			(acceptableMediaType) => {
				return parsedAvailableTypes.some((availableMediaType) => {
					if (acceptableMediaType[0] === availableMediaType[0]) {
						map.set(acceptableMediaType, availableMediaType);
						return true;
					} else if (
						acceptableMediaType[$subtype] === '*' &&
						acceptableMediaType[$type] === availableMediaType[$type]
					) {
						map.set(acceptableMediaType, availableMediaType);
						return true;
					} else if (
						acceptableMediaType[$type] === '*' &&
						acceptableMediaType[$subtype] === '*'
					) {
						map.set(acceptableMediaType, availableMediaType);
						return true;
					}
					return false;
				});
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
				parsedAvailableTypes.indexOf(availableA) -
				parsedAvailableTypes.indexOf(availableB)
			);
		});

		const highestRanked = overlappingTypes[0];
		const availableType = map.get(highestRanked)!;

		return mapToOriginal.get(availableType)!;
	};
};

export default negotiateMediaTypeFactory;
