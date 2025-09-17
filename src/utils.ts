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

import { OWS, TOKEN } from './constants.js';

/**
 * Creates a fast, lazily-initialized character lookup function for a given
 * haystack string.
 *
 * The returned function checks whether a single-character string is present in
 * the haystack.
 * Initialisation is deferred until the first lookup and adapts to available
 * runtime features:
 * - If Set is available, it builds a Set of characters for O(1) membership
 *   checks.
 * - Else if String.prototype.includes is available, it uses includes.
 * - Otherwise falls back to indexOf.
 *
 * @internal
 * @param haystack - String whose characters form the lookup set.
 * @returns A function that returns **true** if the provided single-character
 * string is in the haystack, otherwise **false**.
 *
 * @example
 * const isVowel = fastLookupFactory('aeiou');
 * isVowel('a'); // true
 * isVowel('b'); // false
 */
const fastLookupFactory = (haystack: string) => {
	let internal: (c: string) => boolean;

	return (c: string): boolean => {
		if (!internal) {
			if (typeof Set === 'function') {
				const set = new Set(haystack.split(''));
				internal = (s) => set.has(s);
			} else if (typeof String.prototype.includes === 'function') {
				internal = (s) => haystack.includes(s);
			} else {
				internal = (s) => haystack.indexOf(s) !== -1;
			}
		}

		return internal(c);
	};
};

/**
 * Predicate that tests whether a character is part of the `token` character set
 * defined by RFC 9110 §5.6.2.
 * @internal
 * @param c - Character to check
 * @returns A function that returns **true** if the provided single-character
 * string is in the `token` character set, otherwise **false**.
 */
export const isToken = fastLookupFactory(TOKEN);

/**
 * Predicate that tests whether a character is part of the `OWS` character set
 * as defined by RFC 9110 §5.6.3.
 * @internal
 * @param c - Character to check
 * @returns A function that returns **true** if the provided single-character
 * string is in the `OWS` character set, otherwise **false**.
 */
export const isOWS = fastLookupFactory(OWS);
