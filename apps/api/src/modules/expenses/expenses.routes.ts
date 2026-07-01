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
  createExpenseCategorySchema, createExpenseSchema, expenseSummaryQuerySchema, listExpensesQuerySchema, updateExpenseSchema,
  type CreateExpenseInput, type ExpenseSummaryQuery, type ListExpensesQuery, type UpdateExpenseInput,
} from './expenses.schema';
import { expensesService } from './expenses.service';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();
router.use(authGuard, requireRole(UserRole.SUPER_ADMIN, UserRole.GODOWN_MANAGER));

const actor = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

router.get('/categories', asyncHandler(async (_req: Request, res: Response) => ok(res, await expensesService.listCategories())));
router.post(
  '/categories',
  writeRateLimiter,
  validate({ body: createExpenseCategorySchema }),
  asyncHandler(async (req: Request, res: Response) => created(res, await expensesService.createCategory((req.body as { name: string }).name, actor(req)), 'Category created')),
);

router.get('/summary', validate({ query: expenseSummaryQuerySchema }), asyncHandler(async (req: Request, res: Response) => ok(res, await expensesService.getSummary(req.query as unknown as ExpenseSummaryQuery))));

router.get('/', validate({ query: listExpensesQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { rows, meta } = await expensesService.listExpenses(req.query as unknown as ListExpensesQuery);
  return paginated(res, rows, meta);
}));
router.post('/', writeRateLimiter, validate({ body: createExpenseSchema }), asyncHandler(async (req: Request, res: Response) => created(res, await expensesService.createExpense(req.body as CreateExpenseInput, actor(req)), 'Expense added')));
router.patch('/:id', validate({ params: idParam, body: updateExpenseSchema }), asyncHandler(async (req: Request, res: Response) => ok(res, await expensesService.updateExpense(req.params.id, req.body as UpdateExpenseInput), 'Expense updated')));
router.delete('/:id', validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) => ok(res, await expensesService.deleteExpense(req.params.id), 'Expense deleted')));

export const expensesRouter = router;
