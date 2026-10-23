import type { ErrorRequestHandler, RequestHandler } from 'express';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_TIMEOUT'
  | 'INTERNAL_ERROR';

/** An error that is safe to show to the client as-is. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export const notFound: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

/** Errors raised by express.json() carry a `type` and a 4xx `status`. */
function isBodyParserError(err: unknown): err is { type: string; status: number; message: string } {
  return typeof err === 'object' && err !== null && 'type' in err && 'status' in err;
}

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      return new ApiError(400, 'INVALID_JSON', 'Request body is not valid JSON');
    }
    if (err.type === 'entity.too.large') {
      return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds the 10kb limit');
    }
    if (err.status >= 400 && err.status < 500) {
      return new ApiError(err.status, 'BAD_REQUEST', err.message);
    }
  }

  return new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred', { cause: err });
}

/** Logs server-side failures without request content, provider messages, or secrets. */
function logServerError(requestId: string, apiError: ApiError) {
  const cause = apiError.cause;
  const entry: Record<string, unknown> = { requestId, level: 'error', code: apiError.code };
  if (cause instanceof Error) {
    entry.cause = cause.name;
    if ('status' in cause) entry.upstreamStatus = cause.status;
    // Our own bugs need a stack trace; provider errors do not.
    if (apiError.code === 'INTERNAL_ERROR') entry.stack = cause.stack;
  }
  console.error(JSON.stringify(entry));
}

/** Central error handler: every error response has the same JSON shape. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);

  const apiError = toApiError(err);
  const requestId = res.locals.requestId;
  if (apiError.status >= 500) logServerError(requestId, apiError);

  res.status(apiError.status).json({
    error: { code: apiError.code, message: apiError.message, requestId },
  });
};
