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

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import parseAcceptHeader from '../src/parseAcceptHeader.js';

describe('parseAcceptHeader', () => {
	// Basic well-formed headers
	it('parses simple single type', () => {
		assert.deepEqual(parseAcceptHeader('text/html'), ['text/html']);
	});

	it('parses multiple types separated by comma', () => {
		assert.deepEqual(parseAcceptHeader('text/html, application/json'), [
			'text/html',
			'application/json',
		]);
	});

	it('preserves order of appearance', () => {
		assert.deepEqual(
			parseAcceptHeader('application/xml, text/plain, image/png'),
			['application/xml', 'text/plain', 'image/png'],
		);
	});

	// Wildcards
	it('parses wildcard types', () => {
		assert.deepEqual(parseAcceptHeader('*/*'), ['*/*']);
		assert.deepEqual(parseAcceptHeader('image/*, */*'), ['image/*', '*/*']);
	});

	// Parameters (q, charset, etc.)
	it('preserves parameters', () => {
		assert.deepEqual(parseAcceptHeader('text/html; charset=UTF-8; q=0.9'), [
			'text/html; charset=UTF-8; q=0.9',
		]);
	});

	it('ignores parameters and returns only type/subtype', () => {
		assert.deepEqual(
			parseAcceptHeader(
				'text/html; charset=UTF-8; q=0.9, example/plain, application/example ; q=0.4, test/test',
				true,
			),
			['text/html', 'example/plain', 'application/example', 'test/test'],
		);
	});

	it('parses multiple types with parameters', () => {
		assert.deepEqual(
			parseAcceptHeader('text/html; q=0.8, application/json; q=0.9'),
			['text/html; q=0.8', 'application/json; q=0.9'],
		);
	});

	it('handles quoted parameter values containing commas and semicolons', () => {
		assert.deepEqual(
			parseAcceptHeader('text/plain; title="a, b; c", application/json'),
			['text/plain; title="a, b; c"', 'application/json'],
		);
	});

	it('handles escaped quotes inside quoted parameter values', () => {
		assert.deepEqual(
			parseAcceptHeader(
				'text/plain; title="a \\"quoted\\" text"; q=0.5, image/png',
			),
			['text/plain; title="a \\"quoted\\" text"; q=0.5', 'image/png'],
		);
	});

	// OWS and unusual whitespace
	it('handles optional whitespace around tokens and separators', () => {
		assert.deepEqual(
			parseAcceptHeader(
				'  text/html  ; q=0.7 ,application/json\t; q=0.8 ',
			),
			['text/html  ; q=0.7', 'application/json\t; q=0.8'],
		);
	});

	// Empty and whitespace-only input
	it('returns empty array for empty string', () => {
		assert.deepEqual(parseAcceptHeader(''), []);
	});

	it('returns empty array for whitespace-only string', () => {
		assert.deepEqual(parseAcceptHeader('   \t  '), []);
	});

	// Malformed inputs (strict mode default)
	it('skips malformed entries but continues with later valid ones', () => {
		assert.deepEqual(
			parseAcceptHeader('application/json, bad@@type, text/plain'),
			['application/json', 'text/plain'],
		);
	});

	it('ignores entries missing subtype', () => {
		assert.deepEqual(parseAcceptHeader('text/, application/json'), [
			'application/json',
		]);
	});

	it('ignores stray slashes and extra commas', () => {
		assert.deepEqual(parseAcceptHeader(',,/, , application/xml, ,'), [
			'application/xml',
		]);
	});

	// Permissive mode behaviour (allows some lax constructs)
	it('in permissive mode accepts flag parameters and empty param values', () => {
		const input = 'example/example; foo; bar=; q=0.5, text/plain';
		assert.deepEqual(parseAcceptHeader(input, false, true), [
			'example/example; foo; bar=; q=0.5',
			'text/plain',
		]);
	});

	it('in permissive mode tolerates OWS inside parameter handling', () => {
		const input = 'text/plain;   charset = utf-8  , application/json';
		assert.deepEqual(parseAcceptHeader(input, false, true), [
			'text/plain;   charset = utf-8',
			'application/json',
		]);
	});

	it('in permissive mode tolerates EOF inside quoted string', () => {
		const input = 'text/plain; title="unterminated';
		assert.deepEqual(parseAcceptHeader(input, false, true), [
			'text/plain; title="unterminated',
		]);
	});

	// Edge cases around indexing and boundaries
	it('handles very long inputs and many commas', () => {
		const many = Array.from(
			{ length: 100 },
			(_, i) => `type${i}/sub${i}`,
		).join(',');
		assert.deepEqual(parseAcceptHeader(many).length, 100);
	});

	it('retains case for returned media-ranges', () => {
		assert.deepEqual(
			parseAcceptHeader('TEXT/HTML; Q=0.8, Application/JSON'),
			['TEXT/HTML; Q=0.8', 'Application/JSON'],
		);
	});

	// Entries with q values but ordering preserved (no sorting by q)
	it('does not sort by q; preserves original order', () => {
		const input = 'text/plain;q=0.1, text/html;q=1.0';
		assert.deepEqual(parseAcceptHeader(input), [
			'text/plain;q=0.1',
			'text/html;q=1.0',
		]);
	});

	// Ensure quoted param with escaped backslash then quote handled
	it('handles escaped backslash before quote inside quoted parameter', () => {
		const input = 'text/plain; title="one\\\\"two" , image/jpeg';
		assert.deepEqual(parseAcceptHeader(input), [
			'text/plain; title="one\\\\"two"',
			'image/jpeg',
		]);
	});
});
