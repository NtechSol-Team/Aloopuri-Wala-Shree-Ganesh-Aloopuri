import type { Request, Response } from 'express';
import { ErrorCode, type ApiError } from '../types/api';

/** Terminal 404 handler for unmatched routes. */
export function notFound(req: Request, res: Response): void {
  const body: ApiError = {
    success: false,
    error: { code: ErrorCode.NOT_FOUND, message: `Route not found: ${req.method} ${req.path}` },
  };
  res.status(404).json(body);
}
