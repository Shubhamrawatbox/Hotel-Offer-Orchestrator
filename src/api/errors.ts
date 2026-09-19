/** An error that already knows how it should be rendered to the client. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: { details?: unknown; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = options?.details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'VALIDATION_ERROR', message, { details });

export const notFound = (message: string) => new AppError(404, 'NOT_FOUND', message);

export const serviceUnavailable = (code: string, message: string, cause?: unknown) =>
  new AppError(503, code, message, { cause });
