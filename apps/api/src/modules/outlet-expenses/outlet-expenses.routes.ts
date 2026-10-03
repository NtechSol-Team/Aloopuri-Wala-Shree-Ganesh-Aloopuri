import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireSuperAdmin } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import {
  createOutletExpenseSchema, listOutletExpensesQuerySchema, setOpeningBalanceSchema, updateOutletExpenseSchema,
  type CreateOutletExpenseInput, type ListOutletExpensesQuery, type SetOpeningBalanceInput, type UpdateOutletExpenseInput,
} from './outlet-expenses.schema';
import { outletExpensesService } from './outlet-expenses.service';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();

// Main owner only — a franchise owner never sees what the main owner books
// against their outlet.
router.use(authGuard, requireSuperAdmin);

const actor = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

router.get(
  '/',
  validate({ query: listOutletExpensesQuerySchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await outletExpensesService.listOutletExpenses(req.query as unknown as ListOutletExpensesQuery)),
  ),
);

router.post(
  '/',
  writeRateLimiter,
  validate({ body: createOutletExpenseSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    created(res, await outletExpensesService.createOutletExpense(req.body as CreateOutletExpenseInput, actor(req)), 'Expense added'),
  ),
);

router.put(
  '/opening-balance',
  writeRateLimiter,
  validate({ body: setOpeningBalanceSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await outletExpensesService.setOpeningBalance(req.body as SetOpeningBalanceInput, actor(req)), 'Opening balance saved'),
  ),
);

router.patch(
  '/:id',
  validate({ params: idParam, body: updateOutletExpenseSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await outletExpensesService.updateOutletExpense(req.params.id, req.body as UpdateOutletExpenseInput), 'Expense updated'),
  ),
);

router.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await outletExpensesService.deleteOutletExpense(req.params.id), 'Expense deleted'),
  ),
);

export const outletExpensesRouter = router;
