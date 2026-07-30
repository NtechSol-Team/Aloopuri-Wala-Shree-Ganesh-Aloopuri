import { z } from 'zod';

// 0-4 decimals: 0 for discrete units (Piece, Box), up to 4 for part-measured ones
// (Kg, Litre). The upper bound matches the Decimal(12,4) scale every quantity column
// uses, so a unit can never ask for more precision than the database can store.
export const createUnitSchema = z.object({
  name: z.string().min(1).max(30),
  decimalPlaces: z.coerce.number().int().min(0).max(4).default(2),
});

export const updateUnitSchema = createUnitSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type CreateUnitInput = z.infer<typeof createUnitSchema>;
export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
