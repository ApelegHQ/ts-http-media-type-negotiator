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
const { fuzz: negotiateMediaType } = require('./negotiateMediaType.cjs');
const { fuzz: parseAcceptHeader } = require('./parseAcceptHeader.cjs');
const { fuzz: parseMediaType } = require('./parseMediaType.cjs');

function fuzz(buf) {
	if (buf.length < 1) return;

	switch (buf[0] & 0b11000000) {
		case 0b00000000:
			negotiateMediaType(buf);
			break;
		case 0b01000000:
			parseAcceptHeader(buf);
			break;
		case 0b10000000:
			parseMediaType(buf);
			break;
	}
}

module.exports = { fuzz };
