import { z } from 'zod';
import { MeasurementUnit } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';

const decimalString = z.coerce.number().nonnegative();

// ── Categories ───────────────────────────────────────────────────────────────
export const createCategorySchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(280).optional(),
});
export const updateCategorySchema = createCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ── Products ─────────────────────────────────────────────────────────────────
export const createProductSchema = z.object({
  name: z.string().min(2).max(120),
  sku: z.string().min(2).max(60),
  categoryId: z.string().uuid(),
  unit: z.nativeEnum(MeasurementUnit),
  basePrice: decimalString,
  mrp: decimalString,
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  reorderLevel: decimalString.default(0),
  batchTrackingEnabled: z.boolean().default(false),
  trackInventory: z.boolean().default(true),
});
export const updateProductSchema = createProductSchema.partial().extend({
  isActive: z.boolean().optional(),
  isPosEnabled: z.boolean().optional(),
});

export const listProductsQuerySchema = paginationQuerySchema.extend({
  categoryId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
  isPosEnabled: z.coerce.boolean().optional(),
  search: z.string().max(120).optional(),
});

// ── Bill of materials ────────────────────────────────────────────────────────
const bomRawLine = z.object({
  componentType: z.literal('RAW_MATERIAL'),
  rawMaterialId: z.string().uuid(),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
});
const bomProductLine = z.object({
  componentType: z.literal('PRODUCT'),
  componentProductId: z.string().uuid(),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
});
export const setBomSchema = z.object({
  items: z.array(z.discriminatedUnion('componentType', [bomRawLine, bomProductLine])).max(50),
});

// ── Raw materials ────────────────────────────────────────────────────────────
export const createRawMaterialSchema = z.object({
  name: z.string().min(2).max(120),
  unit: z.nativeEnum(MeasurementUnit),
  supplierName: z.string().max(120).optional(),
  reorderLevel: decimalString.default(0),
  currentStock: decimalString.default(0),
  costPerUnit: decimalString.default(0),
});
export const updateRawMaterialSchema = createRawMaterialSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export const listRawMaterialsQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(120).optional(),
  lowStockOnly: z.coerce.boolean().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>;
export type SetBomInput = z.infer<typeof setBomSchema>;
export type CreateRawMaterialInput = z.infer<typeof createRawMaterialSchema>;
export type UpdateRawMaterialInput = z.infer<typeof updateRawMaterialSchema>;
export type ListRawMaterialsQuery = z.infer<typeof listRawMaterialsQuerySchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
