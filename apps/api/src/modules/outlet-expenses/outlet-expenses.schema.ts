import { z } from 'zod';
import { OutletExpenseLocation, OutletExpensePaymentMethod } from '@prisma/client';
import { istDate, istDayString } from '../../shared/utils/date';

export const listOutletExpensesQuerySchema = z.object({
  outletId: z.string().uuid(),
  from: istDate.optional(),
  to: istDate.optional(),
  location: z.nativeEnum(OutletExpenseLocation).optional(),
  paymentMethod: z.nativeEnum(OutletExpensePaymentMethod).optional(),
});

const MAX_AMOUNT = 9_999_999_999.99; // DECIMAL(12,2)
const notFuture = (d: Date) => istDayString(d) <= istDayString(new Date());

export const createOutletExpenseSchema = z.object({
  outletId: z.string().uuid(),
  expenseDate: istDate.refine(notFuture, 'Expense date cannot be in the future'),
  description: z.string().trim().min(1, 'Description is required').max(200),
  amount: z.coerce.number().positive('Amount must be greater than 0').max(MAX_AMOUNT, 'Amount is too large'),
  paymentMethod: z.nativeEnum(OutletExpensePaymentMethod),
  location: z.nativeEnum(OutletExpenseLocation),
});

export const updateOutletExpenseSchema = createOutletExpenseSchema.omit({ outletId: true }).partial();

export const setOpeningBalanceSchema = z.object({
  outletId: z.string().uuid(),
  amount: z.coerce.number().min(-MAX_AMOUNT).max(MAX_AMOUNT),
  asOfDate: istDate,
  notes: z.string().max(300).optional(),
});

export type ListOutletExpensesQuery = z.infer<typeof listOutletExpensesQuerySchema>;
export type CreateOutletExpenseInput = z.infer<typeof createOutletExpenseSchema>;
export type UpdateOutletExpenseInput = z.infer<typeof updateOutletExpenseSchema>;
export type SetOpeningBalanceInput = z.infer<typeof setOpeningBalanceSchema>;
