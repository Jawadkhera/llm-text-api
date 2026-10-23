import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ApiError } from './errors.js';

// Hashing both values gives equal-length buffers, so timingSafeEqual never throws on a
// length mismatch and the comparison time does not reveal the expected key's length.
const sha256 = (value: string) => createHash('sha256').update(value).digest();

/** Requires the `x-api-key` header to match the configured service key. */
export function requireApiKey(expectedKey: string): RequestHandler {
  const expectedHash = sha256(expectedKey);

  return (req, _res, next) => {
    const provided = req.get('x-api-key');
    if (!provided || !timingSafeEqual(sha256(provided), expectedHash)) {
      return next(new ApiError(401, 'UNAUTHORIZED', 'Missing or invalid API key'));
    }
    next();
  };
}
