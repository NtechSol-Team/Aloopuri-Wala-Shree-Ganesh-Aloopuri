import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodSchema } from 'zod';
import { AppError } from '../utils/AppError';
import { ErrorCode } from '../types/api';

interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Validate and COERCE request parts against Zod schemas. Parsed values replace
 * the originals so downstream handlers receive typed, coerced data.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) req.params = schemas.params.parse(req.params) as typeof req.params;
      if (schemas.query) {
        // req.query is a getter-only in Express 5; mutate in place for Express 4.
        Object.assign(req.query, schemas.query.parse(req.query));
      }
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const first = err.issues[0];
        next(
          new AppError({
            statusCode: 400,
            code: ErrorCode.VALIDATION_ERROR,
            message: first?.message ?? 'Validation failed',
            field: first?.path.join('.'),
          }),
        );
        return;
      }
      next(err);
    }
  };
}
