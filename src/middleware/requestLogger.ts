import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

declare global {
  namespace Express {
    interface Locals {
      requestId: string;
    }
  }
}

/**
 * Assigns a unique ID to each request and logs one line when the response finishes.
 * Only metadata is logged: never headers (which hold the API key) or the request body.
 */
export const requestLogger: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  const start = performance.now();

  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    console.log(
      JSON.stringify({
        requestId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(performance.now() - start),
      }),
    );
  });

  next();
};
