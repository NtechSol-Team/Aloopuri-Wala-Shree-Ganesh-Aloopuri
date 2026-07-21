import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireSuperAdmin } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { imageUpload } from '../../shared/middleware/upload';
import {
  createMenuSchema, updateMenuSchema,
  createMenuCategorySchema, updateMenuCategorySchema,
  createMenuItemSchema, updateMenuItemSchema, reorderMenuItemsSchema,
} from './menus.schema';
import * as c from './menus.controller';

const idParam = z.object({ id: z.string().uuid() });
const categoryParam = z.object({ id: z.string().uuid(), categoryId: z.string().uuid() });
const itemParam = z.object({ id: z.string().uuid(), itemId: z.string().uuid() });

// Menu management is Main Owner (Head Office) only. Outlets never reach here —
// they only ever load their assigned menu through the POS endpoints.
export const menusRouter = Router();
menusRouter.use(authGuard, requireSuperAdmin);

menusRouter.get('/', asyncHandler(c.listMenusController));
menusRouter.post('/', writeRateLimiter, validate({ body: createMenuSchema }), asyncHandler(c.createMenuController));
menusRouter.get('/:id', validate({ params: idParam }), asyncHandler(c.getMenuController));
menusRouter.patch('/:id', validate({ params: idParam, body: updateMenuSchema }), asyncHandler(c.updateMenuController));
menusRouter.delete('/:id', validate({ params: idParam }), asyncHandler(c.deleteMenuController));

// Categories
menusRouter.post('/:id/categories', validate({ params: idParam, body: createMenuCategorySchema }), asyncHandler(c.createMenuCategoryController));
menusRouter.patch('/:id/categories/:categoryId', validate({ params: categoryParam, body: updateMenuCategorySchema }), asyncHandler(c.updateMenuCategoryController));
menusRouter.delete('/:id/categories/:categoryId', validate({ params: categoryParam }), asyncHandler(c.deleteMenuCategoryController));

// Items
menusRouter.post('/:id/items', validate({ params: idParam, body: createMenuItemSchema }), asyncHandler(c.createMenuItemController));
menusRouter.patch('/:id/items/order', validate({ params: idParam, body: reorderMenuItemsSchema }), asyncHandler(c.reorderMenuItemsController));
menusRouter.patch('/:id/items/:itemId', validate({ params: itemParam, body: updateMenuItemSchema }), asyncHandler(c.updateMenuItemController));
menusRouter.delete('/:id/items/:itemId', validate({ params: itemParam }), asyncHandler(c.deleteMenuItemController));
menusRouter.post('/:id/items/:itemId/photo', validate({ params: itemParam }), imageUpload('products').single('file'), asyncHandler(c.uploadMenuItemPhotoController));
menusRouter.delete('/:id/items/:itemId/photo', validate({ params: itemParam }), asyncHandler(c.removeMenuItemPhotoController));
