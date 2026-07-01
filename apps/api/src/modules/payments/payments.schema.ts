import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/utils/pagination';

export const cashPaymentSchema = z.object({
  billId: z.string().uuid(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  paymentDate: z.coerce.date().default(() => new Date()),
  notes: z.string().max(500).optional(),
  receiptPhotoUrl: z.string().max(300).optional(),
});

export const createRazorpayOrderSchema = z.object({
  billId: z.string().uuid(),
});

export const verifyRazorpaySchema = z.object({
  billId: z.string().uuid(),
  razorpayOrderId: z.string().min(3),
  razorpayPaymentId: z.string().min(3),
  razorpaySignature: z.string().min(3),
});

export const listPaymentsQuerySchema = paginationQuerySchema.extend({
  outletId: z.string().uuid().optional(),
  billId: z.string().uuid().optional(),
});

export type CashPaymentInput = z.infer<typeof cashPaymentSchema>;
export type CreateRazorpayOrderInput = z.infer<typeof createRazorpayOrderSchema>;
export type VerifyRazorpayInput = z.infer<typeof verifyRazorpaySchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
