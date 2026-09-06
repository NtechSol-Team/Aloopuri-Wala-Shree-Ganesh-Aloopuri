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

// ── Receive Payment (FIFO across an outlet's outstanding bills) ─────────────

/** A method actually chosen when *collecting* money — excludes the gateway
 *  (RAZORPAY records itself) and NOT_PAID (expense-only, meaningless here). */
export const RECEIVABLE_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.UPI,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CHEQUE,
  PaymentMethod.CARD,
] as const;

const REFERENCE_REQUIRED_METHODS = new Set<PaymentMethod>([
  PaymentMethod.UPI,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CHEQUE,
]);

export const outstandingBillsQuerySchema = z.object({
  outletId: z.string({ required_error: 'Please select an outlet.' }).uuid('Please select an outlet.'),
});

export const receivePaymentPreviewSchema = z.object({
  outletId: z.string({ required_error: 'Please select an outlet.' }).uuid('Please select an outlet.'),
  amount: z.coerce.number({ invalid_type_error: 'Please enter a valid amount.' }).positive('Please enter an amount greater than zero.'),
});

/**
 * What the outlet owner actually submits. `allocations`/`advanceAmount` are the
 * Bill Allocation Preview exactly as shown and confirmed on screen — the server
 * recomputes the same FIFO split fresh against the live bills and requires it to
 * match before committing anything, so a stale screen can never silently post a
 * different split than the one the user looked at.
 */
export const receivePaymentSchema = z
  .object({
    outletId: z.string({ required_error: 'Please select an outlet.' }).uuid('Please select an outlet.'),
    amount: z.coerce.number({ invalid_type_error: 'Please enter a valid amount.' }).positive('Please enter an amount greater than zero.'),
    method: z.nativeEnum(PaymentMethod, { errorMap: () => ({ message: 'Please select a payment method.' }) })
      .refine((m) => (RECEIVABLE_METHODS as readonly PaymentMethod[]).includes(m), { message: 'Please select a payment method.' }),
    paymentDate: istDate
      .default(() => new Date())
      .refine((d) => d.getTime() <= Date.now(), { message: 'Payment date cannot be in the future.' }),
    referenceNumber: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(500).optional(),
    // What the preview showed and the user confirmed — the server's source of
    // truth is always recomputed fresh, this is only compared against it.
    allocations: z
      .array(
        z.object({
          billId: z.string().uuid(),
          amount: z.coerce.number().positive('Each allocation must be greater than zero.'),
        }),
      )
      .max(500),
    advanceAmount: z.coerce.number().min(0, 'Advance amount cannot be negative.').default(0),
    // One per Receive Payment attempt (generated client-side when the dialog opens),
    // so a double-click or a retried request after a dropped connection lands once.
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((data, ctx) => {
    if (REFERENCE_REQUIRED_METHODS.has(data.method) && !data.referenceNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['referenceNumber'],
        message: 'Please enter a reference/transaction number for this payment method.',
      });
    }
    if (data.allocations.length === 0 && data.advanceAmount <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allocations'], message: 'Nothing to allocate — review the bill allocation first.' });
    }
  });

export const outletPaymentHistoryQuerySchema = z.object({
  outletId: z.string({ required_error: 'Please select an outlet.' }).uuid('Please select an outlet.'),
});

export type CashPaymentInput = z.infer<typeof cashPaymentSchema>;
export type CreateRazorpayOrderInput = z.infer<typeof createRazorpayOrderSchema>;
export type VerifyRazorpayInput = z.infer<typeof verifyRazorpaySchema>;
export type ListPaymentsQuery = z.infer<typeof listPaymentsQuerySchema>;
export type OutstandingBillsQuery = z.infer<typeof outstandingBillsQuerySchema>;
export type ReceivePaymentPreviewInput = z.infer<typeof receivePaymentPreviewSchema>;
export type ReceivePaymentInput = z.infer<typeof receivePaymentSchema>;
export type OutletPaymentHistoryQuery = z.infer<typeof outletPaymentHistoryQuerySchema>;
