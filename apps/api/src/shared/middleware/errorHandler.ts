import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { MulterError } from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError';
import { ErrorCode, type ApiError } from '../types/api';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

const MULTER_MESSAGE: Partial<Record<MulterError['code'], string>> = {
  LIMIT_FILE_SIZE: `File is too large (max ${env.MAX_UPLOAD_MB}MB) — try a smaller photo`,
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
};

function sendError(res: Response, status: number, code: ErrorCode, message: string, field?: string) {
  const body: ApiError = { success: false, error: { code, message, field } };
  res.status(status).json(body);
}

/** Central error handler — converts any thrown error into the error envelope. */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (!err.isOperational) logger.error({ err, path: req.path }, 'non-operational AppError');
    sendError(res, err.statusCode, err.code, err.message, err.field);
    return;
  }

  if (err instanceof MulterError) {
    sendError(res, 400, ErrorCode.VALIDATION_ERROR, MULTER_MESSAGE[err.code] ?? err.message, err.field);
    return;
  }

  if (err instanceof ZodError) {
    const first = err.issues[0];
    sendError(res, 400, ErrorCode.VALIDATION_ERROR, first?.message ?? 'Validation failed', first?.path.join('.'));
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // Unique constraint violation.
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? (err.meta?.target as string[]).join(', ') : undefined;
      sendError(res, 409, ErrorCode.CONFLICT, `A record with this ${target ?? 'value'} already exists`, target);
      return;
    }
    // Record not found.
    if (err.code === 'P2025') {
      sendError(res, 404, ErrorCode.NOT_FOUND, 'Resource not found');
      return;
    }
    // FK constraint failure.
    if (err.code === 'P2003') {
      sendError(res, 400, ErrorCode.VALIDATION_ERROR, 'Related record does not exist');
      return;
    }
  }

  logger.error({ err, path: req.path, method: req.method }, 'unhandled error');
  sendError(res, 500, ErrorCode.INTERNAL_ERROR, 'Something went wrong on our end');
}
