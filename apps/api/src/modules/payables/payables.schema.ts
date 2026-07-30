import { z } from 'zod';
import { PaymentMethod, SupplierBillStatus } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';
import { istDate } from '../../shared/utils/date';

export const listPayablesQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(SupplierBillStatus).optional(),
  outstandingOnly: z.coerce.boolean().optional(),
  search: z.string().max(120).optional(),
});

export const paySupplierSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  method: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  paymentDate: istDate.default(() => new Date()),
  notes: z.string().max(500).optional(),
});

export type ListPayablesQuery = z.infer<typeof listPayablesQuerySchema>;
export type PaySupplierInput = z.infer<typeof paySupplierSchema>;
