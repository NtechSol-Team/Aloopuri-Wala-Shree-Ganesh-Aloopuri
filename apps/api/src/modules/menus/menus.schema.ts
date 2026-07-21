import { z } from 'zod';
import { MeasurementUnit } from '@prisma/client';

/** Blank string from a form = clear the field, not store an empty string. */
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v === '' ? null : v)).nullable();

export const createMenuSchema = z.object({
  name: z.string().trim().min(2, 'Give the menu a name').max(80),
  description: optionalText(300),
  // When set, the new menu is seeded as an independent deep-copy of this menu's
  // categories and items (see "Import from existing menu").
  importFromMenuId: z.string().uuid().optional(),
});

export const updateMenuSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: optionalText(300),
  isActive: z.boolean().optional(),
  // Making a menu the default clears the flag on whichever menu held it.
  isDefault: z.boolean().optional(),
});

export const createMenuCategorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a category name').max(60),
});

export const updateMenuCategorySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  displayOrder: z.coerce.number().int().min(0).optional(),
});

export const createMenuItemSchema = z.object({
  name: z.string().trim().min(1, 'Enter an item name').max(120),
  categoryId: z.string().uuid().nullable().optional(),
  code: optionalText(40),
  unit: z.nativeEnum(MeasurementUnit).default(MeasurementUnit.PIECE),
  price: z.coerce.number().positive('Enter a price'),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  isAvailable: z.boolean().default(true),
});

export const updateMenuItemSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  code: optionalText(40),
  unit: z.nativeEnum(MeasurementUnit).optional(),
  price: z.coerce.number().positive().optional(),
  taxPercent: z.coerce.number().min(0).max(100).optional(),
  isAvailable: z.boolean().optional(),
});

export const reorderMenuItemsSchema = z.object({
  items: z
    .array(z.object({ id: z.string().uuid(), displayOrder: z.coerce.number().int().min(0) }))
    .min(1, 'Nothing to reorder'),
});

export type CreateMenuInput = z.infer<typeof createMenuSchema>;
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;
export type CreateMenuCategoryInput = z.infer<typeof createMenuCategorySchema>;
export type UpdateMenuCategoryInput = z.infer<typeof updateMenuCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type ReorderMenuItemsInput = z.infer<typeof reorderMenuItemsSchema>;
