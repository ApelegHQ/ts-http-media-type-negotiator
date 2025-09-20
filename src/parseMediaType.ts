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
import { isOWS, isToken } from './utils.js';

const STATE_INVALID = -1 as const;
const STATE_INITIAL = 0 as const;
const STATE_TYPE = 1 as const;
const STATE_SUBTYPE_START = 2 as const;
const STATE_SUBTYPE = 3 as const;
const STATE_SUBTYPE_END = 4 as const;
const STATE_PARAMS_START = 5 as const;
const STATE_PARAMETER_NAME = 6 as const;
const STATE_PARAMETER_NAME_END = 7 as const;
const STATE_PARAMETER_VALUE_START = 8 as const;
const STATE_PARAMETER_VALUE = 9 as const;
const STATE_PARAMETER_QUOTED = 10 as const;

type TState =
	| typeof STATE_INVALID
	| typeof STATE_INITIAL
	| typeof STATE_TYPE
	| typeof STATE_SUBTYPE_START
	| typeof STATE_SUBTYPE
	| typeof STATE_SUBTYPE_END
	| typeof STATE_PARAMS_START
	| typeof STATE_PARAMETER_NAME
	| typeof STATE_PARAMETER_NAME_END
	| typeof STATE_PARAMETER_VALUE_START
	| typeof STATE_PARAMETER_VALUE
	| typeof STATE_PARAMETER_QUOTED;

type TMediaType = [mimeType: string, [parameter: string, value: string][]] & {
	readonly [$type]: string;
	readonly [$subtype]: string;
};

class MediaTypeParsingError extends Error {}

/**
 * Parse a Content-Type/media-type header value (RFC 9110 §8.3.1) into a
 * tuple-like structure.
 *
 * The function implements a small state machine to parse the type, subtype and
 * parameters, supporting both strict and permissive modes. Returned value is a
 * tuple:
 *   `[ "type/subtype", [ [paramName, paramValue], ... ] ]`
 * with read-only .type and .subtype accessors that return the parsed type and
 * subtype strings.
 *
 * Behaviour highlights:
 * - Recognises `token` characters and `OWS` (optional whitespace) via helpers.
 * - Supports quoted-parameter-values with backslash-escaped characters.
 * - In permissive mode, allows extra OWS, missing parameter values, and
 *   flag-style parameters.
 * - Throws Error('Invalid input') on malformed input when strict (default).
 *
 * @param mediaType - The raw Content-Type header value to parse.
 * @param permissive - If true, accept some common non-RFC inputs (extra OWS,
 *   empty parameter values, flag parameters, truncated trailing quote when
 *   permissive and EOF).
 * @returns Parsed media type tuple: `[ "type/subtype", params ]`
 *   where params is an array of `[name, value]` pairs (name/value are raw
 *   strings; names are not lower-cased).
 *
 * @throws {MediaTypeParsingError} If the input is not a valid media type under
 *   strict parsing (permissive=false).
 *
 * @example
 * parseMediaType('text/plain; charset=utf-8');
 * // -> ['text/plain', [['charset', 'utf-8']]] with `.type === 'text'` and
 * //    `.subtype === 'plain'`
 */
const parseMediaType = (
	mediaType: string,
	permissive?: boolean,
): TMediaType => {
	const params: [string, string][] = [];
	let type: string | undefined, subtype: string | undefined;
	let state: TState = STATE_INITIAL;
	let pos = 0;

	for (let s = 0, t: string | undefined; pos <= mediaType.length; pos++) {
		const chr = mediaType[pos];
		switch (state) {
			case STATE_INITIAL: {
				if (isToken(chr)) {
					state = STATE_TYPE;
					s = pos;
				} else if (isOWS(chr)) {
					continue;
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_TYPE: {
				if (isToken(chr)) {
					continue;
				} else if (chr === '/') {
					type = mediaType.slice(s, pos);
					state = STATE_SUBTYPE_START;
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_SUBTYPE_START: {
				if (isToken(chr)) {
					state = STATE_SUBTYPE;
					s = pos;
				} else if (permissive && isOWS(chr)) {
					continue;
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_SUBTYPE: {
				if (isToken(chr)) {
					continue;
				} else if (chr === ';' || chr === undefined) {
					subtype = mediaType.slice(s, pos);
					state = STATE_PARAMS_START;
				} else if (isOWS(chr)) {
					subtype = mediaType.slice(s, pos);
					state = STATE_SUBTYPE_END;
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_SUBTYPE_END: {
				if (chr === ';' || chr === undefined) {
					state = STATE_PARAMS_START;
				} else if (isOWS(chr)) {
					continue;
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_PARAMS_START: {
				if (isToken(chr)) {
					state = STATE_PARAMETER_NAME;
					s = pos;
				} else if (isOWS(chr) || chr === ';' || chr === undefined) {
					continue;
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_PARAMETER_NAME: {
				if (isToken(chr)) {
					continue;
				} else if (chr === '=') {
					state = STATE_PARAMETER_VALUE_START;
					t = mediaType.slice(s, pos);
				} else if (permissive && isOWS(chr)) {
					state = STATE_PARAMETER_NAME_END;
					t = mediaType.slice(s, pos);
				} else if (permissive && (chr === ';' || chr === undefined)) {
					// Laxer than the RFC mandates
					// 'Flag' parameter, like `example/example; foo; bar=baz`
					params.push([mediaType.slice(s, pos), '']);
					state = STATE_PARAMS_START;
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_PARAMETER_NAME_END: {
				if (isOWS(chr)) {
					continue;
				} else if (chr === ';' || chr === undefined) {
					params.push([t!, '']);
					state = STATE_PARAMS_START;
				} else if (chr === '=') {
					state = STATE_PARAMETER_VALUE_START;
				}
				break;
			}
			case STATE_PARAMETER_VALUE_START: {
				if (isToken(chr)) {
					state = STATE_PARAMETER_VALUE;
					s = pos;
				} else if (chr === '"') {
					state = STATE_PARAMETER_QUOTED;
					s = pos + 1;
				} else if (permissive && isOWS(chr)) {
					// Laxer than the RFC mandates
					continue;
				} else if (permissive && (chr === ';' || chr === undefined)) {
					// Laxer than the RFC mandates, as empty parameter values
					// allowed
					state = STATE_PARAMS_START;
					params.push([t!, '']);
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_PARAMETER_VALUE: {
				if (isToken(chr)) {
					continue;
				} else if (chr === ';' || chr === undefined) {
					state = STATE_PARAMS_START;
					params.push([t!, mediaType.slice(s, pos)]);
				} else if (isOWS(chr)) {
					state = STATE_SUBTYPE_END;
					params.push([t!, mediaType.slice(s, pos)]);
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_PARAMETER_QUOTED: {
				if (
					!(permissive && chr === undefined) &&
					(chr !== '"' || mediaType[pos - 1] === '\\')
				) {
					continue;
				} else {
					state = STATE_SUBTYPE_END;
					params.push([
						t!,
						mediaType.slice(s, pos).replace(/\\(.)/g, (_, c) => c),
					]);
				}
				break;
			}
			case STATE_INVALID: {
				pos = Infinity;
			}
		}
	}

	if (
		!type ||
		!subtype ||
		(!permissive && pos !== mediaType.length + 1) ||
		(state !== STATE_SUBTYPE_END && state !== STATE_PARAMS_START)
	) {
		throw new MediaTypeParsingError('Invalid input');
	}

	const result = [type + '/' + subtype, params] as TMediaType;
	Object.defineProperties(
		result,
		Object.fromEntries([
			[
				$type,
				{
					get: () => type,
				},
			],
			[
				$subtype,
				{
					get: () => subtype,
				},
			],
		]),
	);

	return result;
};

export type { TMediaType };
export { MediaTypeParsingError };
export default parseMediaType;
