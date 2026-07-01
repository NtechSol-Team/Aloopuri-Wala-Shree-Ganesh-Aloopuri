import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import type { CreateExpenseInput, ExpenseSummaryQuery, ListExpensesQuery, UpdateExpenseInput } from './expenses.schema';

const invalidate = () => cache.invalidateTags(CacheTag.EXPENSES, CacheTag.ANALYTICS, CacheTag.DASHBOARD);

export async function listCategories() {
  return prisma.expenseCategory.findMany({
    where: { isDeleted: false, isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, isSystem: true },
  });
}

export async function createCategory(name: string, createdById: string) {
  return prisma.expenseCategory.create({ data: { name, createdById } });
}

export async function listExpenses(query: ListExpensesQuery) {
  const where: Prisma.ExpenseWhereInput = {
    isDeleted: false,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.location ? { location: query.location } : {}),
    ...(query.from || query.to
      ? { expenseDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [rows, total] = await Promise.all([
    prisma.expense.findMany({
      where, orderBy: { expenseDate: 'desc' }, skip, take,
      include: { category: { select: { id: true, name: true } } },
    }),
    prisma.expense.count({ where }),
  ]);
  return { rows, meta: buildPaginationMeta(query, total) };
}

export async function createExpense(input: CreateExpenseInput, createdById: string) {
  const category = await prisma.expenseCategory.findFirst({ where: { id: input.categoryId, isDeleted: false } });
  if (!category) throw AppError.badRequest('Invalid expense category', undefined, 'categoryId');
  const expense = await prisma.expense.create({ data: { ...input, createdById }, include: { category: { select: { id: true, name: true } } } });
  invalidate();
  return expense;
}

export async function updateExpense(id: string, input: UpdateExpenseInput) {
  const existing = await prisma.expense.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Expense not found');
  const expense = await prisma.expense.update({ where: { id }, data: input, include: { category: { select: { id: true, name: true } } } });
  invalidate();
  return expense;
}

export async function deleteExpense(id: string) {
  const existing = await prisma.expense.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Expense not found');
  await prisma.expense.update({ where: { id }, data: { isDeleted: true } });
  invalidate();
  return { deleted: true };
}

export async function getSummary(query: ExpenseSummaryQuery) {
  const where: Prisma.ExpenseWhereInput = {
    isDeleted: false,
    ...(query.location ? { location: query.location } : {}),
    ...(query.from || query.to
      ? { expenseDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {}),
  };

  const [byCategoryRaw, byLocationRaw, totalAgg] = await Promise.all([
    prisma.expense.groupBy({ by: ['categoryId'], _sum: { amount: true }, where }),
    prisma.expense.groupBy({ by: ['location'], _sum: { amount: true }, where }),
    prisma.expense.aggregate({ _sum: { amount: true }, where }),
  ]);

  const categoryIds = byCategoryRaw.map((c) => c.categoryId);
  const cats = await prisma.expenseCategory.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } });
  const nameOf = new Map(cats.map((c) => [c.id, c.name]));

  // Monthly trend (last 6 months) for the same filter.
  const monthly = await prisma.$queryRaw<Array<{ month: string; total: number }>>`
    SELECT to_char(date_trunc('month', expense_date), 'YYYY-MM') AS month, COALESCE(SUM(amount), 0)::float AS total
    FROM expenses
    WHERE is_deleted = false ${query.location ? Prisma.sql`AND location = ${query.location}::"ExpenseLocation"` : Prisma.empty}
      AND expense_date >= date_trunc('month', now()) - interval '5 months'
    GROUP BY 1 ORDER BY 1`;

  return {
    total: Number(totalAgg._sum.amount ?? 0),
    byCategory: byCategoryRaw
      .map((c) => ({ category: nameOf.get(c.categoryId) ?? 'Unknown', total: Number(c._sum.amount ?? 0) }))
      .sort((a, b) => b.total - a.total),
    byLocation: byLocationRaw.map((l) => ({ location: l.location, total: Number(l._sum.amount ?? 0) })),
    monthly,
  };
}

export const expensesService = {
  listCategories, createCategory,
  listExpenses, createExpense, updateExpense, deleteExpense, getSummary,
};
