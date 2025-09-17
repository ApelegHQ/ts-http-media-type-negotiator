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

import { $orignal, $subtype, $type } from './constants.js';
import { type TMediaType } from './parseMediaType.js';

type TNormalisedMediaType = TMediaType & { readonly [$orignal]: TMediaType };

/**
 * Normalises a parsed media type into a canonical, case-normalised form and
 * exposes convenient property accessors.
 *
 * The returned array-like object follows the original `TMediaType` tuple
 * structure but with:
 * - type and subtype converted to lowercase for case-insensitive comparisons,
 * - parameters' names converted to lowercase and sorted alphabetically by
 *   parameter name,
 * - a read-only "original" accessor that returns the original `TMediaType`
 *   value.
 *
 * This function does not clone or modify parameter values; only keys and
 * top-level type/subtype are normalised. The returned object is intended for
 * use as a read-only canonical representation.
 *
 * @param mediaType - Parsed media type tuple to normalise.
 * @returns An array-like, readonly-normalised media type where:
 *   - element 0 is the lowercased type,
 *   - element 1 is an array of `[lowercasedName, value]` pairs sorted by
 *     `lowercasedName`,
 *   - `.type` and `.subtype` getters return the lowercased type and subtype,
 *      respectively,
 *   - `.original` getter returns the original `TMediaType` passed in.
 *
 * @example
 * // Given a parsed media type:
 * const parsed = ['Text', [['Charset', 'utf-8'], ['FORMAT', 'flowed']]];
 * parsed.type = 'Text';
 * parsed.subtype = 'Plain';
 *
 * const norm = normaliseMediaType(parsed);
 * norm[0] === 'text';
 * norm.type === 'text';
 * norm[1][0][0] === 'charset'; // parameter name lowercased
 * norm.original === parsed; // original tuple preserved
 */
const normaliseMediaType = (mediaType: TMediaType): TNormalisedMediaType => {
	const normalised = [
		mediaType[0].toLowerCase(),
		mediaType[1]
			.map((param) => [param[0].toLowerCase(), param[1]])
			.sort((a, b) => {
				return a[0] > b[0] ? 1 : a[0] < b[0] ? -1 : 0;
			}),
	] as TNormalisedMediaType;

	Object.defineProperties(
		normalised,
		Object.fromEntries([
			[
				$type,
				{
					get: () => mediaType[$type].toLowerCase(),
				},
			],
			[
				$subtype,
				{
					get: () => mediaType[$subtype].toLowerCase(),
				},
			],
			[
				$orignal,
				{
					get: () => mediaType,
				},
			],
		]),
	);

	return normalised;
};

export type { TMediaType, TNormalisedMediaType };
export default normaliseMediaType;
