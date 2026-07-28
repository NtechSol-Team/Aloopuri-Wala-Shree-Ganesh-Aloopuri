import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireDeveloperKey } from '../../shared/guards/developerGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import {
  createDeveloperExpenseSchema, updateDeveloperExpenseSchema,
  type CreateDeveloperExpenseInput, type UpdateDeveloperExpenseInput,
} from './developer-expenses.schema';
import { developerExpensesService } from './developer-expenses.service';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();

// Developer's own running costs — same passphrase gate as the payments ledger.
router.use(authGuard, requireDeveloperKey);

const actor = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

router.get('/', asyncHandler(async (_req: Request, res: Response) => ok(res, await developerExpensesService.listExpenses())));

router.post(
  '/',
  writeRateLimiter,
  validate({ body: createDeveloperExpenseSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    created(res, await developerExpensesService.createExpense(req.body as CreateDeveloperExpenseInput, actor(req)), 'Cost added'),
  ),
);

router.patch(
  '/:id',
  validate({ params: idParam, body: updateDeveloperExpenseSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await developerExpensesService.updateExpense(req.params.id, req.body as UpdateDeveloperExpenseInput), 'Cost updated'),
  ),
);

router.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await developerExpensesService.deleteExpense(req.params.id), 'Cost removed')),
);

export const developerExpensesRouter = router;
