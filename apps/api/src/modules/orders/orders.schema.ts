import { z } from 'zod';
import { OutletOrderStatus } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';

export const createOrderSchema = z.object({
  outletId: z.string().uuid().optional(), // only honoured for super admin
  notes: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        requestedQuantity: z.coerce.number().positive('Quantity must be greater than 0'),
      }),
    )
    .min(1, 'Add at least one product'),
});

export const confirmOrderSchema = z.object({
  // Optional per-line quantity adjustments (partial fulfilment).
  items: z
    .array(z.object({ itemId: z.string().uuid(), confirmedQuantity: z.coerce.number().min(0) }))
    .optional(),
});

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(OutletOrderStatus).optional(),
  outletId: z.string().uuid().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ConfirmOrderInput = z.infer<typeof confirmOrderSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
