import { z } from 'zod';
import { DeveloperExpenseCategory } from '@prisma/client';

export const createDeveloperExpenseSchema = z
  .object({
    category: z.nativeEnum(DeveloperExpenseCategory),
    label: z.string().max(80).optional(),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    isRecurring: z.boolean().default(false),
    incurredOn: z.coerce.date(),
    endedOn: z.coerce.date().optional(),
    notes: z.string().max(500).optional(),
  })
  .refine((v) => !v.endedOn || v.endedOn >= v.incurredOn, {
    message: 'End date cannot be before the start date',
    path: ['endedOn'],
  })
  .refine((v) => v.isRecurring || !v.endedOn, {
    message: 'End date only applies to a monthly recurring cost',
    path: ['endedOn'],
  });

export const updateDeveloperExpenseSchema = z.object({
  category: z.nativeEnum(DeveloperExpenseCategory).optional(),
  label: z.string().max(80).nullable().optional(),
  amount: z.coerce.number().positive().optional(),
  isRecurring: z.boolean().optional(),
  incurredOn: z.coerce.date().optional(),
  // Nullable so an ongoing subscription can be re-opened after being ended.
  endedOn: z.coerce.date().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type CreateDeveloperExpenseInput = z.infer<typeof createDeveloperExpenseSchema>;
export type UpdateDeveloperExpenseInput = z.infer<typeof updateDeveloperExpenseSchema>;
