import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireDeveloperKey } from '../../shared/guards/developerGuard';
import { ok } from '../../shared/utils/apiResponse';
import { developerMetricsService } from './developer-metrics.service';

const router = Router();
router.use(authGuard, requireDeveloperKey);

router.get(
  '/recent',
  validate({ query: z.object({ hours: z.coerce.number().int().min(1).max(168).default(24) }) }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await developerMetricsService.getRecentSamples(Number(req.query.hours ?? 24))),
  ),
);

export const developerMetricsRouter = router;
