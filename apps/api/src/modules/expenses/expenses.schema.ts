import { z } from 'zod';
import { ExpenseLocation, PaymentMethod } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';

export const createExpenseSchema = z.object({
  categoryId: z.string().uuid(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  expenseDate: z.coerce.date().default(() => new Date()),
  paymentMethod: z.nativeEnum(PaymentMethod),
  paidTo: z.string().max(120).optional(),
  location: z.nativeEnum(ExpenseLocation).default(ExpenseLocation.GENERAL),
  note: z.string().max(500).optional(),
  receiptPhotoUrl: z.string().max(300).optional(),
});
export const updateExpenseSchema = createExpenseSchema.partial();

export const listExpensesQuerySchema = paginationQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  location: z.nativeEnum(ExpenseLocation).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const expenseSummaryQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  location: z.nativeEnum(ExpenseLocation).optional(),
});

export const createExpenseCategorySchema = z.object({ name: z.string().min(2).max(80) });

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
export type ExpenseSummaryQuery = z.infer<typeof expenseSummaryQuerySchema>;
