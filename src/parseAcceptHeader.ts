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

/**
 * Parse an HTTP Accept header value into an array of media-range strings.
 *
 * The parser implements a small state machine mirroring RFC 9110 media range
 * syntax and is intentionally lightweight: it extracts each "type/subtype"
 * media-range (including any parameters when `typesOnly` is false) as raw
 * substrings from the input without allocating objects for parameters.
 *
 * Features:
 * - Recognises `token` and `OWS` via helpers.
 * - Supports permissive mode to tolerate common non-RFC inputs (extra OWS,
 *   empty parameter values, flag parameters, and truncated quoted values at
 *   EOF).
 * - When `typesOnly` is `true`, only the bare "type/subtype" substrings are
 *   returned; when `false` (default), the returned strings include trailing
 *   parameters as they appear in the header.
 *
 * Behaviour details:
 * - Returns an array of strings in the order they appear in the header.
 * - Does not perform case-normalisation; callers should normalise if needed.
 * - In strict mode (`permissive=false`), malformed segments cause them to be
 *   skipped or the parser to enter an invalid state; parsing continues at the
 *   next comma boundary.
 *
 * @param accept - The raw Accept header value to parse.
 * @param typesOnly - If true, return only the "type/subtype" portion of each
 *   media-range. If false, include parameters (e.g. "text/plain; q=0.5") in the
 *   returned strings.
 * @param permissive - If true, accept some non-RFC-compliant inputs (extra OWS,
 *   empty parameter values, flag parameters like `;foo`, and unterminated
 *   quoted values at EOF).
 * @returns {string[]} Array of media-range strings (either types only or with
 *   parameters), in the same order they appeared in the input.
 *
 * @example
 * parseAcceptHeader('text/html, text/plain;q=0.8, application/json');
 * // -> ['text/html', 'text/plain;q=0.8', 'application/json']
 *
 * @example
 * parseAcceptHeader('text/*;q=0.5, text/plain', true);
 * // -> ['text/*', 'text/plain']
 */
const parseAcceptHeader = (
	accept: string,
	typesOnly?: boolean,
	permissive?: boolean,
): string[] => {
	let state: TState = STATE_INITIAL;
	const types: string[] = [];

	let pos = 0;
	let s = 0,
		te = 0,
		pe = 0;

	const reset = () => {
		state = STATE_INITIAL;
		types.push(accept.slice(s, typesOnly ? te : pe));
	};

	for (; pos <= accept.length; pos++) {
		const chr = accept[pos];
		switch (state) {
			case STATE_INITIAL: {
				if (isOWS(chr) || chr === ',') {
					continue;
				} else if (isToken(chr)) {
					state = STATE_TYPE;
					s = pos;
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_TYPE: {
				if (isToken(chr)) {
					continue;
				} else if (chr === '/') {
					state = STATE_SUBTYPE_START;
				} else if (chr === ',') {
					// reset and continue
					state = STATE_INITIAL;
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_SUBTYPE_START: {
				if (isToken(chr)) {
					state = STATE_SUBTYPE;
				} else if (permissive && isOWS(chr)) {
					continue;
				} else if (chr === ',') {
					// reset and continue
					state = STATE_INITIAL;
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_SUBTYPE: {
				if (isToken(chr)) {
					continue;
				} else if (chr === ',' || chr === undefined) {
					te = pe = pos;
					reset();
				} else if (chr === ';') {
					te = pe = pos;
					state = STATE_PARAMS_START;
				} else if (isOWS(chr)) {
					te = pe = pos;
					state = STATE_SUBTYPE_END;
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_SUBTYPE_END: {
				if (chr === ',' || chr === undefined) {
					reset();
				} else if (chr === ';') {
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
				} else if (isOWS(chr) || chr === ';') {
					continue;
				} else if (chr === ',' || chr === undefined) {
					reset();
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
				} else if (permissive && isOWS(chr)) {
					pe = pos;
					state = STATE_PARAMETER_NAME_END;
				} else if (permissive && chr === ';') {
					// Laxer than the RFC mandates
					// 'Flag' parameter, like `example/example; foo; bar=baz`
					state = STATE_PARAMS_START;
				} else if (permissive && (chr === ',' || chr === undefined)) {
					reset();
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_PARAMETER_NAME_END: {
				if (isOWS(chr)) {
					continue;
				} else if (chr === ';') {
					state = STATE_PARAMS_START;
				} else if (chr === '=') {
					if (permissive) {
						pe = pos + 1;
					}
					state = STATE_PARAMETER_VALUE_START;
				} else if (chr === ',' || chr === undefined) {
					reset();
				}
				break;
			}
			case STATE_PARAMETER_VALUE_START: {
				if (isToken(chr)) {
					state = STATE_PARAMETER_VALUE;
				} else if (chr === '"') {
					state = STATE_PARAMETER_QUOTED;
				} else if (permissive && isOWS(chr)) {
					// Laxer than the RFC mandates
					continue;
				} else if (permissive && chr === ';') {
					// Laxer than the RFC mandates, as empty parameter values
					// allowed
					state = STATE_PARAMS_START;
				} else if (permissive && (chr === ',' || chr === undefined)) {
					// Laxer than the RFC mandates, as empty parameter values
					// allowed
					pe = pos;
					reset();
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_PARAMETER_VALUE: {
				if (isToken(chr)) {
					continue;
				} else if (chr === ';') {
					pe = pos;
					state = STATE_PARAMS_START;
				} else if (chr === ',' || chr === undefined) {
					pe = pos;
					reset();
				} else if (isOWS(chr)) {
					pe = pos;
					state = STATE_SUBTYPE_END;
				} else {
					state = STATE_INVALID;
				}
				break;
			}
			case STATE_PARAMETER_QUOTED: {
				if (permissive && chr === undefined) {
					pe = pos;
					reset();
				} else if (chr !== '"' || accept[pos - 1] === '\\') {
					continue;
				} else {
					state = STATE_SUBTYPE_END;
					pe = pos + 1;
				}
				break;
			}
			case STATE_INVALID: {
				if (chr === ',') {
					// reset and continue
					state = STATE_INITIAL;
				}
				break;
			}
		}
	}

	return types;
};

export default parseAcceptHeader;
