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

import { $orignal, $subtype, $type } from '../src/constants.js';
import defaultStrategy from '../src/defaultStrategy.js';
import type { TNormalisedMediaType } from '../src/normaliseMediaType.js';
import type { TMediaType } from '../src/parseMediaType.js';

// Minimal mock of parseMediaType, sufficient for testing.
const parseMediaType = (mediaTypeStr: string): TMediaType => {
	const [full, ...paramsStr] = mediaTypeStr.split(';').map((s) => s.trim());
	const [type, subtype] = full.split('/');
	const params = paramsStr.map((p): [string, string] => {
		const [name, ...val] = p.split('=');
		return [name, val.join('=') || ''];
	});

	const result = [full, params] as TMediaType;
	Object.defineProperty(result, $type, { value: type });
	Object.defineProperty(result, $subtype, { value: subtype });

	return result;
};

// Minimal mock of normaliseMediaType.
const normaliseMediaType = (parsed: TMediaType): TNormalisedMediaType => {
	const [full, params] = parsed;
	const [type, subtype] = full.split('/');
	const newFull = `${type.toLowerCase()}/${subtype.toLowerCase()}`;
	const newParams = params
		.map(([name, value]) => [name.toLowerCase(), value])
		.sort(([a], [b]) => a.localeCompare(b));

	const result = [newFull, newParams] as TNormalisedMediaType;
	Object.defineProperty(result, $type, { value: type.toLowerCase() });
	Object.defineProperty(result, $subtype, { value: subtype.toLowerCase() });
	Object.defineProperty(result, $orignal, { value: parsed });

	return result;
};

// Minimal mock of findQ.
const findQ = (parsed: TMediaType) => {
	const qParam = parsed[1].find((p) => p[0].toLowerCase() === 'q');
	if (!qParam || qParam[1] === '') return 1;
	const q = parseFloat(qParam[1]);
	return isNaN(q) ? 1 : q;
};

// --- Helper Function for Test Scenarios ---

/**
 * Prepares the necessary data structures for calling `defaultStrategy`.
 * This mimics the setup performed by `negotiateMediaTypeFactory`.
 */
const setup = (availableMediaTypes: string[], acceptHeader: string) => {
	const parsedAvailableTypes = availableMediaTypes.map((type) =>
		normaliseMediaType(parseMediaType(type)),
	);
	const mapToOriginal = new Map(
		parsedAvailableTypes.map((parsed, i) => [
			parsed,
			availableMediaTypes[i],
		]),
	);

	const qMap = new WeakMap<TMediaType, number>();
	const parsedAcceptableTypes = acceptHeader
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean)
		.map((type) => {
			const parsed = parseMediaType(type);
			const normalised = normaliseMediaType(parsed);
			const q = findQ(normalised);
			if (q === 0) return undefined;
			qMap.set(normalised, q);
			return normalised;
		})
		.filter(Boolean as unknown as (x: unknown) => x is TNormalisedMediaType)
		.sort((a, b) => qMap.get(b)! - qMap.get(a)!);

	return { parsedAvailableTypes, parsedAcceptableTypes, qMap, mapToOriginal };
};

const runStrategy = (available: string[], accept: string) => {
	const { parsedAvailableTypes, parsedAcceptableTypes, qMap, mapToOriginal } =
		setup(available, accept);
	const result = defaultStrategy(
		parsedAvailableTypes,
		parsedAcceptableTypes,
		qMap,
	);
	return result ? mapToOriginal.get(result) : null;
};

describe('defaultStrategy', () => {
	it('should return null if no server types are available', () => {
		const result = runStrategy([], 'application/json');
		assert.equal(result, null);
	});

	it('should return null if no overlap exists', () => {
		const result = runStrategy(['image/png'], 'application/json');
		assert.equal(result, null);
	});

	it('should return the server-preferred type for a full wildcard `*/*`', () => {
		const available = ['text/html', 'application/json'];
		const result = runStrategy(available, '*/*');
		assert.equal(result, 'text/html');
	});

	it('should perform an exact match', () => {
		const available = ['text/html', 'application/json'];
		const result = runStrategy(available, 'application/json');
		assert.equal(result, 'application/json');
	});

	it('should ignore client types with q=0', () => {
		const available = ['text/html', 'application/json'];
		const result = runStrategy(
			available,
			'application/json;q=0, text/html;q=0.8',
		);
		assert.equal(result, 'text/html');
	});

	describe('Ranking & Tie-Breaking', () => {
		it('should select the type with the highest q-value', () => {
			const available = ['text/plain', 'text/html'];
			const accept = 'text/plain;q=0.5, text/html;q=0.9';
			const result = runStrategy(available, accept);
			assert.equal(result, 'text/html');
		});

		it('Tie-Breaker 1: should prefer a specific type over a wildcard subtype', () => {
			const available = ['text/plain', 'application/json'];
			const accept = 'text/*, application/json'; // equal q=1
			const result = runStrategy(available, accept);
			// `application/json` is a more specific match than `text/*` for `text/plain`.
			assert.equal(result, 'application/json');
		});

		it('Tie-Breaker 2: should prefer a wildcard subtype over a full wildcard', () => {
			const available = ['image/png', 'application/json'];
			const accept = '*/*, image/*'; // equal q=1
			const result = runStrategy(available, accept);
			// `image/*` is more specific than `*/*`.
			assert.equal(result, 'image/png');
		});

		it('Tie-Breaker 3: should prefer the type with more matching parameters', () => {
			const available = [
				'text/html;profile=a',
				'text/html;charset=utf-8;profile=b',
			];

			const acceptMap = [
				// Both match `text/html;profile=b`, but the second available
				// type has more matching params.
				['text/html;profile=b', available[1]],
				// Both match `text/html;profile=a`, but the first available
				// type has more matching params.
				['text/html;profile=a', available[0]],
				// Both match both `text/html;profile=a` and
				// `text/html;profile=b`, but the first available is preferred
				// by the server.
				['text/html;profile=b,text/html;profile=a', available[0]],
				// Both match both `text/html;profile=a` and
				// `text/html;profile=b`, but the second available is preferred
				// by the client.
				[
					'text/html;profile=b,text/html;profile=a;q=0.99',
					available[1],
				],
				// Both match both `text/html;profile=a` and
				// `text/html;profile=b`, but the second available is preferred
				// by the client (same as previous but testing q evaluation).
				[
					'text/html;profile=a;q=0.99,text/html;profile=b',
					available[1],
				],
			];
			acceptMap.forEach(([accept, expected]) => {
				const result = runStrategy(available, accept);
				assert.equal(result, expected);
			});
		});

		it('Tie-Breaker 4: should use server preference as the final tie-breaker', () => {
			const available = ['audio/basic', 'audio/aiff']; // Server prefers basic
			const accept = 'audio/*';
			const result = runStrategy(available, accept);
			// Both are equally specific, q=1, no params. Server preference wins.
			assert.equal(result, 'audio/basic');
		});
	});

	describe('Complex Scenarios', () => {
		it('should correctly navigate a complex Accept header', () => {
			const available = [
				'image/svg+xml',
				'application/json',
				'text/html;charset=utf-8',
			];
			const accept =
				'text/html;q=0.8, application/xhtml+xml, application/xml;q=0.9, image/*;q=0.7, */*;q=0.5';

			// Analysis:
			// - `application/xhtml+xml` (q=1) has no match.
			// - `application/xml` (q=0.9) has no match.
			// - `text/html` (q=0.8) matches `text/html;charset=utf-8`.
			// - `image/*` (q=0.7) matches `image/svg+xml`.
			// The highest q-value with a match is 0.8.
			const result = runStrategy(available, accept);
			assert.equal(result, 'text/html;charset=utf-8');
		});

		it('should prefer specific match even if wildcard appears first in header', () => {
			const available = ['text/plain', 'text/html'];
			const accept = 'text/*, text/html'; // Both q=1
			// `text/html` is a more specific match for itself than `text/*`.
			const result = runStrategy(available, accept);
			assert.equal(result, 'text/html');
		});

		it('should handle case-insensitivity in type, subtype, and param names', () => {
			const available = ['application/json;charset=UTF-8'];
			const accept = 'APPLICATION/JSON;CHARSET=UTF-8';
			const result = runStrategy(available, accept);
			assert.equal(result, 'application/json;charset=UTF-8');
		});
	});
});
