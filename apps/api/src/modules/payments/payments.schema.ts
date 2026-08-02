import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';
import { istDate } from '../../shared/utils/date';

/**
 * Money taken in person and keyed in by the owner/godown. Not always literal
 * cash: outlets paying against the UPI QR hand nothing over, but the credit
 * still has to be recorded by the side that can see it land, so `method`
 * distinguishes them. Defaults to CASH, which is what every existing caller
 * meant before this field existed.
 */
export const cashPaymentSchema = z.object({
  billId: z.string().uuid(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  method: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  paymentDate: istDate.default(() => new Date()),
  // The bank's own UTR — nothing here can verify it, so this is only ever a note
  // the recorder chose to type, not proof the transfer happened.
  referenceNumber: z.string().max(100).optional(),
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
