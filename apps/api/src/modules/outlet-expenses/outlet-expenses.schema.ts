import { z } from 'zod';
import { OutletExpenseLocation, OutletExpensePaymentMethod } from '@prisma/client';
import { istDate, istDayString } from '../../shared/utils/date';

const MAX_AMOUNT = 9_999_999_999.99; // DECIMAL(12,2)
const notFuture = (d: Date) => istDayString(d) <= istDayString(new Date());
const year = z.coerce.number().int().min(2020).max(2100);
const month = z.coerce.number().int().min(1).max(12);
const amount = z.coerce.number().positive('Amount must be greater than 0').max(MAX_AMOUNT, 'Amount is too large');

export const monthStatementQuerySchema = z.object({
  outletId: z.string().uuid(),
  year,
  month,
  location: z.nativeEnum(OutletExpenseLocation).optional(),
  paymentMethod: z.nativeEnum(OutletExpensePaymentMethod).optional(),
});

export const createOutletExpenseSchema = z.object({
  outletId: z.string().uuid(),
  expenseDate: istDate.refine(notFuture, 'Expense date cannot be in the future'),
  description: z.string().trim().min(1, 'Description is required').max(200),
  amount,
  paymentMethod: z.nativeEnum(OutletExpensePaymentMethod),
  location: z.nativeEnum(OutletExpenseLocation),
});

export const updateOutletExpenseSchema = createOutletExpenseSchema.omit({ outletId: true }).partial();

export const createWithdrawalSchema = z.object({
  outletId: z.string().uuid(),
  year,
  month,
  withdrawDate: istDate.refine(notFuture, 'Withdrawal date cannot be in the future'),
  amount,
  paymentMethod: z.nativeEnum(OutletExpensePaymentMethod),
  notes: z.string().trim().max(300).optional(),
});

export type MonthStatementQuery = z.infer<typeof monthStatementQuerySchema>;
export type CreateOutletExpenseInput = z.infer<typeof createOutletExpenseSchema>;
export type UpdateOutletExpenseInput = z.infer<typeof updateOutletExpenseSchema>;
export type CreateWithdrawalInput = z.infer<typeof createWithdrawalSchema>;
