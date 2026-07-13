import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import { AppError } from '../utils/AppError';

const DEV_KEY_HEADER = 'x-developer-key';

/**
 * Gate for the hidden developer window (outlet management). The caller must send
 * the developer passphrase in the `x-developer-key` header, matching env.DEVELOPER_KEY.
 *
 * Fails closed: if DEVELOPER_KEY is unset/blank, every request is rejected — an
 * empty key must never authorise an empty header. Runs after authGuard, so the
 * caller is also a logged-in user; this is an extra factor on top of that.
 */
export function requireDeveloperKey(req: Request, _res: Response, next: NextFunction): void {
  const provided = req.header(DEV_KEY_HEADER);
  if (!env.DEVELOPER_KEY || provided !== env.DEVELOPER_KEY) {
    next(AppError.forbidden('Invalid or missing developer key'));
    return;
  }
  next();
}
