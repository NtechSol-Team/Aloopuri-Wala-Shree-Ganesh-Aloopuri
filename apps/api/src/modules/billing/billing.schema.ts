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

export type ListBillsQuery = z.infer<typeof listBillsQuerySchema>;
