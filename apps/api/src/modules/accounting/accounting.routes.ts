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
import { istDate } from '../../shared/utils/date';

const router = Router();
router.use(authGuard, requireSuperAdmin); // the owner's finance hub

router.get('/position', asyncHandler(async (_req: Request, res: Response) => ok(res, await accountingService.getPosition())));

router.get(
  '/daybook',
  validate({ query: z.object({ from: istDate.optional(), to: istDate.optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const to = (req.query.to as unknown as Date) ?? new Date();
    const from = (req.query.from as unknown as Date) ?? subDays(to, 30);
    return ok(res, await accountingService.getDayBook(from, to));
  }),
);

router.get('/ledger/accounts', asyncHandler(async (_req: Request, res: Response) => ok(res, await accountingService.getLedgerAccounts())));

router.get(
  '/ledger',
  validate({
    query: z.object({
      accountId: z.string().min(3),
      from: istDate.optional(),
      to: istDate.optional(),
      search: z.string().max(120).optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as { accountId: string; from?: Date; to?: Date; search?: string };
    // `to` is an inclusive calendar day, so widen it to the start of the next day —
    // the service filters with a half-open range.
    const to = q.to ? new Date(q.to.getTime() + 24 * 60 * 60 * 1000) : undefined;
    return ok(res, await accountingService.getLedger(q.accountId, q.from, to, q.search));
  }),
);

router.get('/profitability', asyncHandler(async (_req: Request, res: Response) => ok(res, await accountingService.getProductProfitability())));

export const accountingRouter = router;
