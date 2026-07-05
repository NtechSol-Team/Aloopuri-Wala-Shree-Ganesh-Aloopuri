import { z } from 'zod';
import { ContactType } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';

export const createContactSchema = z.object({
  type: z.nativeEnum(ContactType).default(ContactType.CUSTOMER),
  name: z.string().min(2).max(120),
  gstin: z.string().max(15).optional(),
  legalName: z.string().max(160).optional(),
  tradeName: z.string().max(160).optional(),
  stateCode: z.string().max(2).optional(),
  stateName: z.string().max(60).optional(),
  address: z.string().max(400).optional(),
  phone: z.string().max(20).optional(),
  whatsapp: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
  bankAccountHolder: z.string().max(160).optional(),
  bankName: z.string().max(160).optional(),
  bankAccountNumber: z.string().max(40).optional(),
  bankIfsc: z.string().max(11).optional(),
});
export const updateContactSchema = createContactSchema.partial().extend({ isActive: z.boolean().optional() });

export const listContactsQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(120).optional(),
  type: z.nativeEnum(ContactType).optional(),
});

export const gstLookupQuerySchema = z.object({ gstin: z.string().min(15).max(15) });

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;
