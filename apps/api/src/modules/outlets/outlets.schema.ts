import { z } from 'zod';
import { OutletDocumentCategory, PricingMode } from '@prisma/client';
import { isValidGstin } from '../../shared/utils/gst';

/** Blank strings from a form mean "clear this field", not "set it to empty". */
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? null : v)).nullable();

const gstinField = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .nullable()
  .transform((v) => (v === '' || v == null ? null : v))
  .refine((v) => v == null || isValidGstin(v), 'Invalid GSTIN (format/checksum failed)');

/**
 * The outlet's own business identity. Kept separate from the structural fields
 * below because the main owner edits these day-to-day, while creating outlets and
 * changing their code/pricing stays behind the developer window.
 */
export const outletProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  legalName: optionalText(160),
  address: optionalText(400),
  phone: optionalText(20),
  email: z.string().trim().email('Enter a valid email').optional().nullable().or(z.literal('').transform(() => null)),
  gstin: gstinField,
  fssaiNumber: optionalText(20),
  receiptFooter: optionalText(160),
});

export const createOutletSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(20),
  address: z.string().max(400).optional(),
  phone: z.string().max(20).optional(),
  creditPeriodDays: z.coerce.number().int().nonnegative().max(365).default(15),
  pricingMode: z.nativeEnum(PricingMode).default(PricingMode.GENERIC),
  // Their orders are priced — and paid for — before anyone reviews them, so whether
  // this outlet is billed with GST has to be settled when the outlet is created.
  gstBilling: z.boolean().default(true),
});

export const updateOutletSchema = createOutletSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const setOutletPricesSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().uuid(), price: z.coerce.number().nonnegative() }))
    .max(500),
});

export const uploadDocumentSchema = z.object({
  title: z.string().trim().min(2, 'Give the document a name').max(120),
  category: z.nativeEnum(OutletDocumentCategory).optional(),
  notes: z.string().trim().max(300).optional(),
});

export type OutletProfileInput = z.infer<typeof outletProfileSchema>;
export type CreateOutletInput = z.infer<typeof createOutletSchema>;
export type UpdateOutletInput = z.infer<typeof updateOutletSchema>;
export type SetOutletPricesInput = z.infer<typeof setOutletPricesSchema>;
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
