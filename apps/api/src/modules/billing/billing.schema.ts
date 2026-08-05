import { z } from 'zod';
import { BillStatus } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';
import { istDate } from '../../shared/utils/date';

export const listBillsQuerySchema = paginationQuerySchema.extend({
  outletId: z.string().uuid().optional(),
  status: z.nativeEnum(BillStatus).optional(),
  overdueOnly: z.coerce.boolean().optional(),
  from: istDate.optional(),
  to: istDate.optional(),
  sort: z.enum(['billDate', 'dueDate', 'amount']).default('billDate'),
});

/**
 * Back-entry of a sale that happened but never got recorded. The date is free —
 * that's the point of the feature — and each line carries its own price so the
 * owner can reproduce what was actually charged rather than today's catalog rate.
 */
export const createManualBillSchema = z.object({
  outletId: z.string().uuid(),
  // Back-entry is for sales that already happened. A future date would sit in a
  // period that hasn't been reported yet and break ageing/overdue arithmetic.
  billDate: istDate.refine((d) => d.getTime() <= Date.now() + 24 * 60 * 60 * 1000, {
    message: 'Bill date cannot be in the future',
  }),
  isGstBill: z.boolean().optional(),
  /**
   * Whether this back-entry should move stock as well as raise the bill. Defaults
   * true — matching what a real sale does, and what this endpoint did before the
   * option existed. Turn it off to bill for goods whose stock was already accounted
   * for some other way, so the bill lands without touching inventory.
   */
  deductStock: z.boolean().default(true),
  notes: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.coerce.number().positive('Quantity must be greater than 0'),
        unitPrice: z.coerce.number().nonnegative(),
      }),
    )
    .min(1, 'Add at least one product'),
});

export type ListBillsQuery = z.infer<typeof listBillsQuerySchema>;
export type CreateManualBillInput = z.infer<typeof createManualBillSchema>;
