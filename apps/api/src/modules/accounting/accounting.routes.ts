import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireSuperAdmin } from '../../shared/guards/roleGuard';
import { ok } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { accountingService } from './accounting.service';
import { istDate, endOfIstDayExclusive } from '../../shared/utils/date';

const router = Router();
router.use(authGuard, requireSuperAdmin); // the owner's finance hub

const user = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
};

router.get('/position', asyncHandler(async (_req: Request, res: Response) => ok(res, await accountingService.getPosition())));

router.get(
  '/daybook',
  validate({ query: z.object({ from: istDate.optional(), to: istDate.optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    // No bounds = all time (the old code quietly fell back to the last 30 days).
    // `to` is the last day to INCLUDE: the query wants an exclusive bound, so it's
    // pushed to the next IST midnight — otherwise "Today" dropped all of today.
    const q = req.query as unknown as { from?: Date; to?: Date };
    return ok(res, await accountingService.getDayBook(q.from, q.to ? endOfIstDayExclusive(q.to) : undefined));
  }),
);

router.get(
  '/cashbook',
  validate({ query: z.object({ from: istDate.optional(), to: istDate.optional() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    // No bounds = all time from the very first entry (opening 0), not the last 30 days.
    const q = req.query as unknown as { from?: Date; to?: Date };
    return ok(res, await accountingService.getCashBook(q.from, q.to ? endOfIstDayExclusive(q.to) : undefined));
  }),
);

const cashAdjustmentSchema = z.object({
  amount: z.coerce.number().refine((v) => v !== 0, 'Amount cannot be zero'),
  adjustmentDate: istDate.refine((d) => d.getTime() <= Date.now(), { message: 'Adjustment date cannot be in the future' }),
  reason: z.string().trim().min(1, 'Reason is required').max(200),
});

router.post(
  '/cashbook/adjustments',
  validate({ body: cashAdjustmentSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await accountingService.addCashAdjustment(user(req), req.body), 'Adjustment recorded'),
  ),
);

router.delete(
  '/cashbook/adjustments/:id',
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await accountingService.deleteCashAdjustment(req.params.id), 'Adjustment removed'),
  ),
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
