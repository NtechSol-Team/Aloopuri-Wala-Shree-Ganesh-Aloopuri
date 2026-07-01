import { z } from 'zod';
import { BillStatus } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';

export const listBillsQuerySchema = paginationQuerySchema.extend({
  outletId: z.string().uuid().optional(),
  status: z.nativeEnum(BillStatus).optional(),
  overdueOnly: z.coerce.boolean().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['billDate', 'dueDate', 'amount']).default('billDate'),
});

export type ListBillsQuery = z.infer<typeof listBillsQuerySchema>;
