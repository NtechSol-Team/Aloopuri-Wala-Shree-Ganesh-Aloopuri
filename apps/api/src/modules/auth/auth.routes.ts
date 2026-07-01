import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { authRateLimiter } from '../../shared/middleware/rateLimit';
import { loginSchema, refreshSchema } from './auth.schema';
import {
  listSessionsController,
  loginController,
  logoutController,
  meController,
  refreshController,
  revokeSessionController,
} from './auth.controller';

const router = Router();

router.post('/login', authRateLimiter, validate({ body: loginSchema }), asyncHandler(loginController));
router.post('/refresh', authRateLimiter, validate({ body: refreshSchema }), asyncHandler(refreshController));

router.post('/logout', authGuard, asyncHandler(logoutController));
router.get('/me', authGuard, asyncHandler(meController));
router.get('/sessions', authGuard, asyncHandler(listSessionsController));
router.delete(
  '/sessions/:sessionId',
  authGuard,
  validate({ params: z.object({ sessionId: z.string().uuid() }) }),
  asyncHandler(revokeSessionController),
);

export const authRouter = router;
