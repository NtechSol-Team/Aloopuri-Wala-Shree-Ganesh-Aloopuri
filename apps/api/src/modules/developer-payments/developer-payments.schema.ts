import { z } from 'zod';
import { DeveloperPaymentScope, PaymentMethod } from '@prisma/client';
import { istDate } from '../../shared/utils/date';

const base = z.object({
  scope: z.nativeEnum(DeveloperPaymentScope),
  outletId: z.string().uuid().optional(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  method: z.nativeEnum(PaymentMethod).optional(),
  paidOn: istDate,
  // Optional on input — the service defaults it to paidOn + 1 year when omitted.
  renewalDate: istDate.optional(),
  notes: z.string().max(500).optional(),
});

export const createDeveloperPaymentSchema = base.refine(
  (v) => (v.scope === DeveloperPaymentScope.OUTLET ? !!v.outletId : !v.outletId),
  { message: 'outletId is required for scope OUTLET, and must be omitted for MAIN_ADMIN', path: ['outletId'] },
);

export const updateDeveloperPaymentSchema = z.object({
  amount: z.coerce.number().positive().optional(),
  method: z.nativeEnum(PaymentMethod).optional(),
  paidOn: istDate.optional(),
  renewalDate: istDate.optional(),
  notes: z.string().max(500).optional(),
});

export type CreateDeveloperPaymentInput = z.infer<typeof createDeveloperPaymentSchema>;
export type UpdateDeveloperPaymentInput = z.infer<typeof updateDeveloperPaymentSchema>;
