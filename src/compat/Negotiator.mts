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

// Module for compatibility with `negotiator`
// (<https://github.com/jshttp/negotiator>).

import type { IncomingMessage } from 'node:http';
import negotiateMediaType from '../negotiateMediaType.js';
import parseAcceptHeader from '../parseAcceptHeader.js';

interface INegotiator {
	request: Pick<IncomingMessage, 'headers'>;

	/**
	 * Returns the most preferred media type from the client.
	 *
	 * @param [availableMediaTypes] When provided, returns the most preferred
	 * media type from a list of available media types.
	 */
	mediaType(
		this: INegotiator,
		availableMediaTypes?: string[],
	): string | undefined;

	/**
	 * Returns an array of preferred media types ordered by the client
	 * preference
	 *
	 * @param [availableMediaTypes] When provided, returns an array of preferred
	 * media types ordered by priority from a list of available media types.
	 */
	mediaTypes(this: INegotiator, availableMediaTypes?: string[]): string[];
}

interface INegotiatorConstructor {
	(this: unknown, request: Pick<IncomingMessage, 'headers'>): INegotiator;
	new (request: Pick<IncomingMessage, 'headers'>): INegotiator;
	prototype: INegotiator;
}

/**
 * The negotiator constructor receives a request object
 */
const Negotiator = function (request) {
	if (!(this instanceof Negotiator)) {
		return new Negotiator(request);
	}

	this.request = request;
} as INegotiatorConstructor;

Negotiator.prototype.mediaType = function (availableMediaTypes) {
	const result = this.mediaTypes(availableMediaTypes);
	if (result.length) {
		return result[0];
	}
};

Negotiator.prototype.mediaTypes = function (availableMediaTypes) {
	const accept = this.request.headers.accept;

	if (!availableMediaTypes) {
		return accept ? parseAcceptHeader(accept, true) : [];
	}

	const result = negotiateMediaType(availableMediaTypes, accept);

	return result ? [result] : [];
};

export default Negotiator;
export { Negotiator };
