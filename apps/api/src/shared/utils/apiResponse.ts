import type { Response } from 'express';
import type { ApiSuccess, PaginationMeta } from '../types/api';

/** Send a success envelope. */
export function ok<T>(res: Response, data: T, message = 'OK', status = 200): Response {
  const body: ApiSuccess<T> = { success: true, data, message };
  return res.status(status).json(body);
}

/** Send a created (201) success envelope. */
export function created<T>(res: Response, data: T, message = 'Created'): Response {
  return ok(res, data, message, 201);
}

/** Send a paginated success envelope with meta. */
export function paginated<T>(
  res: Response,
  data: T[],
  meta: PaginationMeta,
  message = 'OK',
): Response {
  const body: ApiSuccess<T[]> = { success: true, data, message, meta };
  return res.status(200).json(body);
}
