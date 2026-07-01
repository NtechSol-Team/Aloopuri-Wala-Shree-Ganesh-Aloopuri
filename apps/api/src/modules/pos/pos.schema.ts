import { z } from 'zod';
import { PosPaymentMode } from '@prisma/client';

export const openSessionSchema = z.object({
  openingCash: z.coerce.number().nonnegative().default(0),
  outletId: z.string().uuid().optional(), // admin may open a main-branch session by omitting
});

export const closeSessionSchema = z.object({
  closingCash: z.coerce.number().nonnegative(),
});

export const createTransactionSchema = z.object({
  sessionId: z.string().uuid(),
  clientUuid: z.string().uuid().optional(), // offline idempotency key
  customerName: z.string().max(120).optional(),
  customerPhone: z.string().max(20).optional(),
  billDiscount: z.coerce.number().nonnegative().default(0),
  paymentMode: z.nativeEnum(PosPaymentMode),
  cashReceived: z.coerce.number().nonnegative().optional(),
  split: z.object({ cash: z.coerce.number().nonnegative(), card: z.coerce.number().nonnegative(), upi: z.coerce.number().nonnegative() }).optional(),
  soldAt: z.coerce.date().optional(), // for offline-synced sales
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.coerce.number().positive(),
        discount: z.coerce.number().nonnegative().default(0),
      }),
    )
    .min(1, 'Add at least one item'),
});

export const voidTransactionSchema = z.object({ reason: z.string().min(2).max(200) });

export type OpenSessionInput = z.infer<typeof openSessionSchema>;
export type CloseSessionInput = z.infer<typeof closeSessionSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type VoidTransactionInput = z.infer<typeof voidTransactionSchema>;
