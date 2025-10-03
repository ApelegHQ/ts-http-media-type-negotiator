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

import findQ from './lib/findQ.js';
import type { TMediaType } from './parseMediaType.js';
import parseMediaType from './parseMediaType.js';
import rawParseAcceptHeader from './rawParseAcceptHeader.js';
import { wm } from './utils.js';

/**
 * Parse an HTTP Accept header into an array of media type strings, with
 * optional filtering, sorting by quality factors (q), and the option to return
 * only type/subtype.
 *
 * This function wraps a lower-level parser (`rawParseAcceptHeader`) that splits
 * the header into raw media type strings, then optionally parses each media
 * type into its structured representation (`parseMediaType`) to inspect `q`
 * values and other parameters. It supports permissive parsing mode for
 * non-strict inputs.
 *
 * Behaviour summary:
 * - If `accept` is empty or undefined, returns `['*' + '/*']`.
 * - If neither `typesOnly` nor `sort` are requested, returns that raw list
 *   immediately (fast path).
 * - Otherwise, parses each media-type string into a `TMediaType` structure.
 * - Filters out media types with a zero `q` value.
 * - If `sort` is true, sorts the remaining types in descending order by `q`.
 * - If `typesOnly` is true, returns just the `type/subtype` strings
 *   (e.g. "text/html").
 *   If `typesOnly` is false, returns the original raw media-type strings
 *   (including parameters).
 *
 * Notes:
 * - The function uses weak maps internally to associate parsed structures with
 *   original strings and to store q-values for sorting; these are not exposed.
 * - `permissive` is forwarded to the underlying parsers to allow tolerant
 *    parsing of malformed headers.
 *
 * Example:
 *   parseAcceptHeader('text/html;q=0.8, application/json;q=0.9', true)
 *   // => ['application/json;q=0.9', 'text/html;q=0.8']
 *
 * Example (typesOnly):
 *   parseAcceptHeader('text/html;q=0.8, application/json;q=0.9', true, true)
 *   // => ['application/json', 'text/html']
 *
 * @param accept The raw value of an HTTP Accept header. If omitted or falsy,
 * the function returns ['*' + '/*'] as the default.
 *
 * @param sort If true, returned media types are sorted in descending order of
 * their quality parameter. If false, the original order is preserved
 * (unless filtering removes entries).
 *
 * @param typesOnly If true, the function returns only the "type/subtype"
 * portion of each media type (e.g., 'text/html'), omitting any parameters.
 * If false, original raw media-type strings (with parameters) are returned.
 *
 * @param permissive Passed to the underlying parsers to enable permissive
 * tolerances when parsing malformed or non-standard media type strings. When
 * true, the parsers attempts to salvage non-RFC complient inputs.
 *
 * @returns An array of media-type strings. When `typesOnly` is true, elements
 * are `type/subtype` strings; otherwise they are the original media-type
 * strings provided by the client. If `accept` is falsy, returns ['*' + '/*'].
 */
const parseAcceptHeader = (
	accept?: string,
	sort?: boolean,
	typesOnly?: boolean,
	permissive?: boolean,
): string[] => {
	if (!accept) {
		return ['*/*'];
	}

	const result = rawParseAcceptHeader(accept, permissive);

	if (!typesOnly && !sort) {
		return result;
	}

	const qmap = wm<TMediaType, number>();
	const dmap = typesOnly ? undefined : wm<TMediaType, string>();
	const parsed = result.map((t) => {
		const p = parseMediaType(t, permissive);
		if (!typesOnly) {
			dmap!.set(p, t);
		}
		return p;
	});

	const filtered = parsed.filter((t) => {
		const q = findQ(t);
		if (!q) return false;

		qmap.set(t, q);
		return true;
	});

	if (sort) {
		filtered.sort((a, b) => {
			const qa = qmap.get(a)!;
			const qb = qmap.get(b)!;

			return qb - qa;
		});
	}

	const list = filtered.map(
		typesOnly
			? (t) => {
					return t[0];
				}
			: (t) => {
					return dmap!.get(t)!;
				},
	);

	return list;
};

export default parseAcceptHeader;
