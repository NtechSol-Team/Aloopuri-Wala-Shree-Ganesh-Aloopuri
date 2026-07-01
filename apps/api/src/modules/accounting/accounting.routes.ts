import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { subDays } from 'date-fns';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireSuperAdmin } from '../../shared/guards/roleGuard';
import { ok } from '../../shared/utils/apiResponse';
import { accountingService } from './accounting.service';

const router = Router();
router.use(authGuard, requireSuperAdmin); // the owner's finance hub

router.get('/position', asyncHandler(async (_req: Request, res: Response) => ok(res, await accountingService.getPosition())));

router.get(
  '/daybook',
  validate({ query: z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const to = (req.query.to as unknown as Date) ?? new Date();
    const from = (req.query.from as unknown as Date) ?? subDays(to, 30);
    return ok(res, await accountingService.getDayBook(from, to));
  }),
);

router.get('/profitability', asyncHandler(async (_req: Request, res: Response) => ok(res, await accountingService.getProductProfitability())));

export const accountingRouter = router;
