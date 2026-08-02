import { z } from 'zod';
import { OutletOrderStatus } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';
import { istDate } from '../../shared/utils/date';

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

/** Calling off an order before it is fulfilled. */
export const rejectOrderSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const verifyOrderPaymentSchema = z.object({
  razorpayOrderId: z.string().min(4),
  razorpayPaymentId: z.string().min(4),
  razorpaySignature: z.string().min(8),
});

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(OutletOrderStatus).optional(),
  outletId: z.string().uuid().optional(),
  /** Inclusive IST calendar-day bounds on orderDate. */
  from: istDate.optional(),
  to: istDate.optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type RejectOrderInput = z.infer<typeof rejectOrderSchema>;
export type VerifyOrderPaymentInput = z.infer<typeof verifyOrderPaymentSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
