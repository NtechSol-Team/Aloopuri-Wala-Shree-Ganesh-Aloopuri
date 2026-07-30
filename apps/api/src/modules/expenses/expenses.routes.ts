import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireRole } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok, paginated } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import {
  createExpenseCategorySchema, updateExpenseCategorySchema, createExpenseSchema, expenseSummaryQuerySchema, listExpensesQuerySchema, updateExpenseSchema,
  type CreateExpenseInput, type ExpenseSummaryQuery, type ListExpensesQuery, type UpdateExpenseInput,
} from './expenses.schema';
import { expensesService } from './expenses.service';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();
// A franchise owner keeps their own branch's expense book. The service scopes every
// read and write to whoever is asking (see shared/utils/books), so one owner can
// never see or touch another branch's costs, nor the company's.
router.use(authGuard, requireRole(UserRole.SUPER_ADMIN, UserRole.GODOWN_MANAGER, UserRole.FRANCHISE_OWNER));

const actor = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
};

router.get('/categories', asyncHandler(async (_req: Request, res: Response) => ok(res, await expensesService.listCategories())));
router.post(
  '/categories',
  writeRateLimiter,
  validate({ body: createExpenseCategorySchema }),
  asyncHandler(async (req: Request, res: Response) => created(res, await expensesService.createCategory((req.body as { name: string }).name, actor(req).id), 'Category created')),
);
// Categories are shared labels, so a branch may add one it needs — but renaming
// relabels every historical expense including the company's, which is not a
// branch's call.
router.patch(
  '/categories/:id',
  requireRole(UserRole.SUPER_ADMIN, UserRole.GODOWN_MANAGER),
  validate({ params: idParam, body: updateExpenseCategorySchema }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await expensesService.updateCategory(req.params.id, (req.body as { name: string }).name), 'Category renamed')),
);

router.get('/summary', validate({ query: expenseSummaryQuerySchema }), asyncHandler(async (req: Request, res: Response) => ok(res, await expensesService.getSummary(req.query as unknown as ExpenseSummaryQuery, actor(req)))));

router.get('/', validate({ query: listExpensesQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { rows, meta } = await expensesService.listExpenses(req.query as unknown as ListExpensesQuery, actor(req));
  return paginated(res, rows, meta);
}));
router.post('/', writeRateLimiter, validate({ body: createExpenseSchema }), asyncHandler(async (req: Request, res: Response) => created(res, await expensesService.createExpense(req.body as CreateExpenseInput, actor(req)), 'Expense added')));
router.patch('/:id', validate({ params: idParam, body: updateExpenseSchema }), asyncHandler(async (req: Request, res: Response) => ok(res, await expensesService.updateExpense(req.params.id, req.body as UpdateExpenseInput, actor(req)), 'Expense updated')));
router.delete('/:id', validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) => ok(res, await expensesService.deleteExpense(req.params.id, actor(req)), 'Expense deleted')));

export const expensesRouter = router;
