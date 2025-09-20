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
/* eslint-disable @typescript-eslint/no-require-imports */
const {
	negotiateMediaType,
	MediaTypeParsingError,
} = require('../../dist/index.cjs');

function fuzz(buf) {
	if (buf.length < 1) return;

	try {
		// choose random number of elements between 0 and maxElements (inclusive)
		const maxElements = buf.byteLength - 1;
		const count = ((0, Math.random)() * (maxElements + 1)) | 0;
		const permissive = !!(buf[0] & 0b01);
		const noAccept = !!(buf[0] & 0b10);

		buf = buf.subarray(1);

		// build an array of `count` random-length pieces taken from buf
		const parts = new Array(count);
		for (let i = 0; i < count; i++) {
			// pick random start and length for each piece (can be empty)
			const start = ((0, Math.random)() * buf.byteLength) | 0;
			const len = ((0, Math.random)() * (buf.byteLength - start + 1)) | 0;
			parts[i] = buf.subarray(start, start + len).toString();
		}

		const l = ((0, Math.random)() * buf.byteLength) | 0;
		const buf2 = buf.subarray(l).toString();

		negotiateMediaType(parts, noAccept ? null : buf2, permissive);
	} catch (e) {
		if (!(e instanceof MediaTypeParsingError)) {
			throw e;
		}
	}
}

module.exports = { fuzz };
