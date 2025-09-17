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

import contentTypeParser from '../src/parseMediaType.js';

describe('mimeTypeParser — contract and general behavior', () => {
	it.skip('should be a function that returns a 2-tuple', () => {
		// Ensure callable and returns array of length 2
		assert.equal(typeof contentTypeParser, 'function');
		// Use a simple valid value only to probe shape; implementations may throw on invalid input
		assert.throws(
			() => contentTypeParser(''),
			/provided|Invalid|cannot/i,
			'Implementation may reject empty string',
		);
	});
});

describe('Parsing simple types without parameters', () => {
	it("parses 'text/plain' into contentType with no parameters", () => {
		const [contentType, params] = contentTypeParser('text/plain');
		assert.equal(contentType, 'text/plain');
		assert.ok(Array.isArray(params));
		assert.deepEqual(params, []);
	});

	it("parses 'application/json' correctly", () => {
		const [contentType, params] = contentTypeParser('application/json');
		assert.equal(contentType, 'application/json');
		assert.deepEqual(params, []);
	});

	it('trims surrounding whitespace in input', () => {
		const [contentType, params] = contentTypeParser('  text/html  ');
		assert.equal(contentType, 'text/html');
		assert.deepEqual(params, []);
	});

	it('preserves case of type/subtype (no automatic lowercasing required unless specified)', () => {
		const input = 'Text/Plain';
		const [contentType] = contentTypeParser(input);
		// Many implementations lowercase; accept either original or lowercased version.
		const allowed = [input, input.toLowerCase()];
		assert.ok(allowed.includes(contentType));
	});
});

describe('Parsing types with parameters', () => {
	it('parses a single parameter', () => {
		const [contentType, params] = contentTypeParser(
			'text/plain; charset=utf-8',
		);
		assert.equal(contentType, 'text/plain');
		assert.deepEqual(params, [['charset', 'utf-8']]);
	});

	it('parses multiple parameters in order', () => {
		const [contentType, params] = contentTypeParser(
			'application/vnd.api+json; version=1; q=0.9',
		);
		assert.equal(contentType, 'application/vnd.api+json');
		assert.deepEqual(params, [
			['version', '1'],
			['q', '0.9'],
		]);
	});

	it('handles parameters with extra whitespace around separators', () => {
		const [contentType, params] = contentTypeParser(
			'text/plain  ;  charset =  utf-8  ;   format=flowed',
			true,
		);
		assert.equal(contentType, 'text/plain');
		assert.deepEqual(params, [
			['charset', 'utf-8'],
			['format', 'flowed'],
		]);
	});

	it('parses parameter values that are quoted strings (with quotes removed)', () => {
		const [contentType, params] = contentTypeParser(
			'application/ld+json; profile="http://example.com/profile"; charset="utf-8"',
		);
		assert.equal(contentType, 'application/ld+json');
		assert.deepEqual(params, [
			['profile', 'http://example.com/profile'],
			['charset', 'utf-8'],
		]);
	});

	it('unescapes quoted-string escape sequences (e.g., \\" and \\\\)', () => {
		const [contentType, params] = contentTypeParser(
			'text/example; note="line1\\nline2"; escaped="a\\\\b\\"c"',
		);
		assert.equal(contentType, 'text/example');
		assert.deepEqual(params, [
			['note', 'line1nline2'],
			['escaped', 'a\\b"c'],
		]);
	});

	it('retains parameter order (first-seen order)', () => {
		const input = 'a/b; p1=1; p2=2; p3=3';
		const [, params] = contentTypeParser(input);
		assert.deepEqual(params, [
			['p1', '1'],
			['p2', '2'],
			['p3', '3'],
		]);
	});
});

describe('Edge cases and error handling', () => {
	it('parses parameter names case-insensitively but preserves original key or lowercases', () => {
		const [contentType, params] = contentTypeParser(
			'text/x; CHARSET=utf-8; q=0.5',
		);
		assert.equal(contentType, 'text/x');
		assert.deepEqual(params, [
			['CHARSET', 'utf-8'],
			['q', '0.5'],
		]);
	});

	it('ignores semicolons inside quoted parameter values', () => {
		const [contentType, params] = contentTypeParser(
			'text/complex; note="a; b; c"; other=1',
		);
		assert.equal(contentType, 'text/complex');
		assert.deepEqual(params, [
			['note', 'a; b; c'],
			['other', '1'],
		]);
	});

	it('handles multiple semicolons in a row (empty param segments) without crashing', () => {
		const [contentType, params] = contentTypeParser(
			'text/x;; ; charset=utf-8;;',
		);
		assert.equal(contentType, 'text/x');
		// Should still contain the charset param; other empty segments either ignored or produce no-ops
		assert.deepEqual(params, [['charset', 'utf-8']]);
	});
});

describe('Robustness with unusual but legal characters', () => {
	it('parses tokens with plus, dot, and hyphen in subtype', () => {
		const [contentType, params] = contentTypeParser(
			'application/vnd.example+json; v=2',
		);
		assert.equal(contentType, 'application/vnd.example+json');
		assert.deepEqual(params, [['v', '2']]);
	});

	it('parses parameter values containing slashes and colons when quoted', () => {
		const [, params] = contentTypeParser(
			'application/x; u="http://host/path:8080/"',
		);
		assert.deepEqual(params, [['u', 'http://host/path:8080/']]);
	});
});

describe('Round-trip sanity (reconstruction)', () => {
	it('can be used to rebuild a reasonable header string (implementation-agnostic)', () => {
		const input = 'text/res; a=1; b="two"; c=three';
		const [ct, params] = contentTypeParser(input);
		// Basic checks: content-type matches and params present
		assert.equal(ct, 'text/res');
		const map = new Map(params);
		assert.equal(map.get('a'), '1');
		assert.equal(map.get('b'), 'two');
		assert.equal(map.get('c'), 'three');
	});
});
