import rateLimit, { type Options } from 'express-rate-limit';
import { ErrorCode, type ApiError } from '../types/api';

function limiter(windowMs: number, max: number, message: string): ReturnType<typeof rateLimit> {
  const handlerBody: ApiError = {
    success: false,
    error: { code: ErrorCode.RATE_LIMITED, message },
  };
  const options: Partial<Options> = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json(handlerBody);
    },
  };
  return rateLimit(options);
}

/** 5 requests / minute — auth endpoints (login, refresh). */
export const authRateLimiter = limiter(60_000, 5, 'Too many attempts. Please wait a minute and try again.');

/** 30 requests / minute — general write endpoints. */
export const writeRateLimiter = limiter(60_000, 30, 'Too many requests. Please slow down.');
