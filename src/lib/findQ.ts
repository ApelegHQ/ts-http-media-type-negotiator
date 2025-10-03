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

import { TMediaType } from '../parseMediaType.js';

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
	const qParam = mediaType[1].find((p) => p[0].toLowerCase() === 'q');
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

export default findQ;
