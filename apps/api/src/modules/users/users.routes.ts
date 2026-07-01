import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireSuperAdmin } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import {
  createUserSchema,
  listUsersQuerySchema,
  resetPasswordSchema,
  updateUserSchema,
} from './users.schema';
import {
  createUserController,
  deactivateUserController,
  getUserController,
  listUsersController,
  resetPasswordController,
  updateUserController,
} from './users.controller';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();

// All user-management endpoints are super-admin only.
router.use(authGuard, requireSuperAdmin);

router.get('/', validate({ query: listUsersQuerySchema }), asyncHandler(listUsersController));
router.post('/', writeRateLimiter, validate({ body: createUserSchema }), asyncHandler(createUserController));
router.get('/:id', validate({ params: idParam }), asyncHandler(getUserController));
router.patch('/:id', writeRateLimiter, validate({ params: idParam, body: updateUserSchema }), asyncHandler(updateUserController));
router.delete('/:id', validate({ params: idParam }), asyncHandler(deactivateUserController));
router.post('/:id/reset-password', writeRateLimiter, validate({ params: idParam, body: resetPasswordSchema }), asyncHandler(resetPasswordController));

export const usersRouter = router;
