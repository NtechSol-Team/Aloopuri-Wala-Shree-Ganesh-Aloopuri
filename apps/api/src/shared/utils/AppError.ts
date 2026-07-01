import { ErrorCode } from '../types/api';

/**
 * Application error carrying an HTTP status, a stable machine code, and an
 * optional offending field. Thrown anywhere; translated to the error envelope
 * by the central error handler.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly field?: string;
  readonly isOperational: boolean;

  constructor(params: {
    statusCode: number;
    code: ErrorCode;
    message: string;
    field?: string;
    isOperational?: boolean;
  }) {
    super(params.message);
    this.name = 'AppError';
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.field = params.field;
    this.isOperational = params.isOperational ?? true;
    Error.captureStackTrace(this, AppError);
  }

  static badRequest(message: string, code = ErrorCode.VALIDATION_ERROR, field?: string) {
    return new AppError({ statusCode: 400, code, message, field });
  }
  static unauthorized(message = 'Authentication required') {
    return new AppError({ statusCode: 401, code: ErrorCode.UNAUTHORIZED, message });
  }
  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError({ statusCode: 403, code: ErrorCode.FORBIDDEN, message });
  }
  static notFound(message = 'Resource not found') {
    return new AppError({ statusCode: 404, code: ErrorCode.NOT_FOUND, message });
  }
  static conflict(message: string, field?: string) {
    return new AppError({ statusCode: 409, code: ErrorCode.CONFLICT, message, field });
  }
  static invalidState(message: string) {
    return new AppError({ statusCode: 409, code: ErrorCode.INVALID_STATE, message });
  }
  static insufficientStock(message: string) {
    return new AppError({ statusCode: 409, code: ErrorCode.INSUFFICIENT_STOCK, message });
  }
  static payment(message: string) {
    return new AppError({ statusCode: 402, code: ErrorCode.PAYMENT_ERROR, message });
  }
  static internal(message = 'Something went wrong') {
    return new AppError({
      statusCode: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message,
      isOperational: false,
    });
  }
}
