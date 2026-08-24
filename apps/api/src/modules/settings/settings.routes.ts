import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireSuperAdmin } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { ok } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { settingsService } from './settings.service';

const router = Router();
router.use(authGuard);

const user = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
};

// Every authenticated role can read it — a franchise owner's Call button needs to
// know the number just as much as the main owner editing it does.
router.get(
  '/call-number',
  asyncHandler(async (_req: Request, res: Response) => ok(res, { phone: await settingsService.getCallButtonPhone() })),
);

router.put(
  '/call-number',
  requireSuperAdmin,
  writeRateLimiter,
  validate({ body: z.object({ phone: z.string().trim().max(20) }) }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, { phone: await settingsService.setCallButtonPhone(user(req), (req.body as { phone: string }).phone) }, 'Contact number saved'),
  ),
);

export const settingsRouter = router;
