import { z } from 'zod';
import { FulfillmentSource, OutletOrderStatus } from '@prisma/client';
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

/** Main owner approving a credit order: the last chance to trim quantities or reprice. */
export const approveOrderSchema = z.object({
  // Whether the resulting bill carries GST. Defaults to the outlet's billing
  // preference, which is what the order was priced with.
  isGstBill: z.boolean(),
  items: z
    .array(z.object({
      itemId: z.string().uuid(),
      confirmedQuantity: z.coerce.number().min(0),
      unitPrice: z.coerce.number().nonnegative().optional(),
    }))
    .optional(),
});

/** Rejecting a credit order, or an outlet cancelling its own unsettled order. */
export const rejectOrderSchema = z.object({
  reason: z.string().max(500).optional(),
});

/** Where the stock is pulled from — decided when the goods actually leave. */
export const dispatchOrderSchema = z.object({
  fulfillmentSource: z.nativeEnum(FulfillmentSource).default(FulfillmentSource.MAIN_BRANCH),
});

export const verifyOrderPaymentSchema = z.object({
  razorpayOrderId: z.string().min(4),
  razorpayPaymentId: z.string().min(4),
  razorpaySignature: z.string().min(8),
});

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(OutletOrderStatus).optional(),
  outletId: z.string().uuid().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ApproveOrderInput = z.infer<typeof approveOrderSchema>;
export type RejectOrderInput = z.infer<typeof rejectOrderSchema>;
export type DispatchOrderInput = z.infer<typeof dispatchOrderSchema>;
export type VerifyOrderPaymentInput = z.infer<typeof verifyOrderPaymentSchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
