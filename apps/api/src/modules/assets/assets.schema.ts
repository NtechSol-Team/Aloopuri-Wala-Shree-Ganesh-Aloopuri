import { z } from 'zod';
import { AssetStatus, ExpenseLocation } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';
import { istDate } from '../../shared/utils/date';

export const createAssetSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  serialNumber: z.string().max(80).optional(),
  quantity: z.coerce.number().positive().default(1),
  purchaseCost: z.coerce.number().nonnegative(),
  purchaseDate: istDate.default(() => new Date()),
  supplierName: z.string().max(120).optional(),
  invoiceNumber: z.string().max(80).optional(),
  location: z.nativeEnum(ExpenseLocation).default(ExpenseLocation.GENERAL),
  status: z.nativeEnum(AssetStatus).default(AssetStatus.IN_USE),
  notes: z.string().max(500).optional(),
});

export const updateAssetSchema = createAssetSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const listAssetsQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(120).optional(),
  status: z.nativeEnum(AssetStatus).optional(),
  location: z.nativeEnum(ExpenseLocation).optional(),
});

export type CreateAssetInput = z.infer<typeof createAssetSchema>;
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>;
export type ListAssetsQuery = z.infer<typeof listAssetsQuerySchema>;
