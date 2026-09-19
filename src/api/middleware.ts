import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger';
import { AppError } from './errors';

const httpLog = logger.child({ component: 'http' });

/** Accepts an inbound correlation id or mints one, and always echoes it back. */
export const requestContext: RequestHandler = (req, res, next) => {
  const inbound = req.header('x-request-id');
  req.id = inbound && inbound.length <= 128 ? inbound : randomUUID();
  req.startedAt = Date.now();
  res.setHeader('x-request-id', req.id);
  next();
};

/** One structured line per request, emitted once the response is on the wire. */
export const accessLog: RequestHandler = (req, res, next) => {
  res.on('finish', () => {
    const durationMs = Date.now() - req.startedAt;
    const payload = {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs,
    };
    if (res.statusCode >= 500) httpLog.error(payload, 'Request failed');
    else if (res.statusCode >= 400) httpLog.warn(payload, 'Request rejected');
    else httpLog.info(payload, 'Request completed');
  });
  next();
};

/** Forwards rejected promises from async handlers into Express' error pipeline. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `No route matches ${req.method} ${req.path}`));
};

/**
 * Single place that turns anything thrown into the error envelope. Validation
 * problems become 400s with field-level detail; unexpected errors are logged in
 * full but reported generically.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
        details: error.issues.map((issue) => ({
          field: issue.path.join('.') || '(query)',
          message: issue.message,
        })),
        requestId: req.id,
      },
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
        requestId: req.id,
      },
    });
    return;
  }

  httpLog.error(
    {
      requestId: req.id,
      path: req.originalUrl,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    },
    'Unhandled error',
  );

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId: req.id,
    },
  });
}
