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
			if (import.meta.format === 'esm' || typeof Set === 'function') {
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

type TOptional<T, TK extends keyof T> = Omit<T, TK> & Partial<Pick<T, TK>>;

/**
 * Creates a WeakMap-like factory that returns a native WeakMap when available,
 * or a lightweight fallback implementation when WeakMap is not supported.
 *
 * This exported constant is an IIFE that detects the runtime environment:
 * - If `WeakMap` is available, it constructs and returns a native `WeakMap`.
 * - If `WeakMap` is not available, it returns an object that satisfies
 *   the `WeakMap` interface (`get`, `set`, `has`, `delete`, and
 *   `Symbol.toStringTag`) backed by an internal array of entries.
 *
 * The fallback does not provide the true garbage-collection semantics of a
 * real `WeakMap`; it simply mimics the API for environments that lack
 * `WeakMap` support.
 *
 * Type parameters:
 * @template TK - Type of keys (constrained to `WeakKey` in the local types).
 * @template TV - Type of values stored in the map.
 *
 * Parameters:
 * @param entries - Optional iterable of key/value pairs to initialise the
 *  returned map with. When provided, entries are copied into the underlying
 *  storage.
 *
 * Returns:
 * @returns A `WeakMap` instance (native when available) or a fallback object
 *  that satisfies the `WeakMap<TK, TV>` interface.
 *
 * Notes:
 * - The fallback implementation uses strict (===) reference equality for keys.
 * - The fallback's `set` method returns the fallback object itself to match the
 *   `WeakMap#set` fluent API.
 * - Use this factory when you need a WeakMap-like API and want to tolerate
 *   environments without native WeakMap support.
 *
 * @internal
 */
export const wm = (() => {
	let internal: <TK extends WeakKey = object, TV = unknown>(
		entries?: readonly (readonly [TK, TV])[] | null,
	) => WeakMap<TK, TV>;

	return <TK extends WeakKey, TV>(
		entries?: readonly (readonly [TK, TV])[] | null,
	): WeakMap<TK, TV> => {
		if (!internal) {
			if (import.meta.format === 'esm' || typeof WeakMap === 'function') {
				internal = ((entries?: readonly (readonly [TK, TV])[] | null) =>
					new WeakMap<TK, TV>(entries)) as unknown as typeof internal;
			} else {
				const findIndex = (
					arr: readonly (readonly [TK, TV])[],
					key: TK,
				): number => {
					for (let i = 0; i < arr.length; i++) {
						if (arr[i][0] === key) return i;
					}
					return -1;
				};

				internal = ((
					entries?: readonly (readonly [TK, TV])[] | null,
				) => {
					const storage = entries ? Array.from(entries) : [];
					const obj: TOptional<
						WeakMap<TK, TV>,
						typeof Symbol.toStringTag
					> = {
						delete: (key: TK): boolean => {
							const index = findIndex(storage, key);
							if (index === -1) return false;

							storage.splice(index, 1);
							return true;
						},
						get: (key: TK): TV | undefined => {
							const index = findIndex(storage, key);
							if (index === -1) return undefined;

							return storage[index][1];
						},
						has: (key: TK): boolean => {
							const index = findIndex(storage, key);

							return index !== -1;
						},
						set: (key: TK, value: TV): WeakMap<TK, TV> => {
							const index = findIndex(storage, key);
							if (index === -1) {
								storage.push([key, value]);
							} else {
								storage.splice(index, 1, [key, value]);
							}

							return obj as WeakMap<TK, TV>;
						},
					};

					if (
						typeof Symbol === 'function' &&
						typeof Symbol.toStringTag === 'symbol'
					) {
						Object.defineProperty(obj, Symbol.toStringTag, {
							value: 'WeakMap',
						});
					}

					return Object.create(obj);
				}) as unknown as typeof internal;
			}
		}

		return internal<TK, TV>(entries);
	};
})();

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
