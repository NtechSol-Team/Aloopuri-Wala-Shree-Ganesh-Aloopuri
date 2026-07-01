import { z } from 'zod';
import { paginationQuerySchema } from '../../shared/utils/pagination';

export const createCustomerSchema = z.object({
  name: z.string().min(2).max(120),
  gstin: z.string().max(15).optional(),
  legalName: z.string().max(160).optional(),
  tradeName: z.string().max(160).optional(),
  stateCode: z.string().max(2).optional(),
  stateName: z.string().max(60).optional(),
  address: z.string().max(400).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
});
export const updateCustomerSchema = createCustomerSchema.partial().extend({ isActive: z.boolean().optional() });

export const listCustomersQuerySchema = paginationQuerySchema.extend({ search: z.string().max(120).optional() });

export const gstLookupQuerySchema = z.object({ gstin: z.string().min(15).max(15) });

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
