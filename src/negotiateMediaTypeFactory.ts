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

import defaultStrategy from './defaultStrategy.js';
import findQ from './lib/findQ.js';
import type { TNormalisedMediaType } from './normaliseMediaType.js';
import normaliseMediaType from './normaliseMediaType.js';
import parseMediaType, { type TMediaType } from './parseMediaType.js';
import rawParseAcceptHeader from './rawParseAcceptHeader.js';
import { wm } from './utils.js';

/**
 * Defines the contract for a function that implements a content negotiation
 * strategy.
 *
 * A strategy function is responsible for selecting the single best media type
 * from a list of available server types, based on a list of acceptable client
 * types. It encapsulates the core ranking and selection logic.
 *
 * The factory function `negotiateMediaTypeFactory` handles the initial parsing
 * of raw header strings and pre-sorts the acceptable types by their q-value.
 * The strategy function receives this structured, pre-processed data and must
 * implement the algorithm to find the single best match.
 *
 * This allows for custom negotiation logic beyond the default RFC 7231
 * implementation, such as simpler matching rules or different tie-breaking
 * behaviours.
 *
 * @param parsedAvailableTypes - A readonly array of pre-parsed and normalised
 *   media types supported by the server, ordered by server preference (most
 *   preferred first).
 * @param parsedAcceptableTypes - A readonly array of pre-parsed media types
 *   from the client's `Accept` header. This array is guaranteed to be
 *   pre-sorted in descending order of q-value.
 * @param qMap - A readonly map providing an efficient way to look up the
 *   q-value (weight) for any given media type from the `parsedAcceptableTypes`
 *   array.
 * @returns The best-matching normalised media type from the
 *   `parsedAvailableTypes` array, or `null` if no suitable match is found
 *   according to the strategy's rules.
 */
interface IMediaTypeNegotiationStrategy {
	(
		parsedAvailableTypes: readonly TNormalisedMediaType[],
		parsedAcceptableTypes: readonly TNormalisedMediaType[],
		qMap: Readonly<WeakMap<TMediaType, number>>,
	): TNormalisedMediaType | null;
}

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
 * @param strategy - Optional custom negotiation strategy.
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
const negotiateMediaTypeFactory = (
	availableMediaTypes: string[],
	strategy: IMediaTypeNegotiationStrategy = defaultStrategy,
) => {
	if (availableMediaTypes.length === 0) {
		return () => null;
	}

	const mapToOriginal = wm<TMediaType, string>();
	const parsedAvailableTypes = availableMediaTypes.map((mediaType) => {
		const value = normaliseMediaType(parseMediaType(mediaType));
		mapToOriginal.set(value, mediaType);
		return value;
	});

	return (accept?: string | null | undefined, permissive?: boolean) => {
		if (!accept) {
			return availableMediaTypes[0];
		}

		const qMap = wm<TMediaType, number>();

		const parsedAcceptableTypes = rawParseAcceptHeader(accept, permissive)
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
					x: TNormalisedMediaType | undefined,
				) => x is TNormalisedMediaType,
			)
			.sort((a, b) => {
				const qa = qMap.get(a!)!;
				const qb = qMap.get(b!)!;

				return qb - qa;
			});

		const availableType = strategy(
			parsedAvailableTypes,
			parsedAcceptableTypes,
			qMap,
		);
		const result = availableType ? mapToOriginal.get(availableType) : null;

		return result || null;
	};
};

export default negotiateMediaTypeFactory;
export type { IMediaTypeNegotiationStrategy };
