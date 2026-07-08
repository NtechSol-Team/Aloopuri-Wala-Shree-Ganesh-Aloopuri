import { z } from 'zod';
import { PricingMode } from '@prisma/client';

export const createOutletSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(20),
  address: z.string().max(400).optional(),
  phone: z.string().max(20).optional(),
  creditPeriodDays: z.coerce.number().int().nonnegative().max(365).default(15),
  pricingMode: z.nativeEnum(PricingMode).default(PricingMode.GENERIC),
});
export const updateOutletSchema = createOutletSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const setOutletPricesSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().uuid(), price: z.coerce.number().nonnegative() }))
    .max(500),
});

export type CreateOutletInput = z.infer<typeof createOutletSchema>;
export type UpdateOutletInput = z.infer<typeof updateOutletSchema>;
export type SetOutletPricesInput = z.infer<typeof setOutletPricesSchema>;
