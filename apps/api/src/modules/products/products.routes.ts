import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireSuperAdmin, requireGodownAccess } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { imageUpload } from '../../shared/middleware/upload';
import {
  createCategorySchema, createProductSchema, createRawMaterialSchema,
  listProductsQuerySchema, listRawMaterialsQuerySchema, setBomSchema,
  updateCategorySchema, updateProductSchema, updateRawMaterialSchema,
} from './products.schema';
import * as c from './products.controller';

const idParam = z.object({ id: z.string().uuid() });

// ── Categories ──
export const categoriesRouter = Router();
categoriesRouter.use(authGuard);
categoriesRouter.get('/', asyncHandler(c.listCategoriesController));
categoriesRouter.post('/', requireSuperAdmin, writeRateLimiter, validate({ body: createCategorySchema }), asyncHandler(c.createCategoryController));
categoriesRouter.patch('/:id', requireSuperAdmin, validate({ params: idParam, body: updateCategorySchema }), asyncHandler(c.updateCategoryController));
categoriesRouter.delete('/:id', requireSuperAdmin, validate({ params: idParam }), asyncHandler(c.deleteCategoryController));

// ── Products ──
export const productsRouter = Router();
productsRouter.use(authGuard);
productsRouter.get('/', validate({ query: listProductsQuerySchema }), asyncHandler(c.listProductsController));
productsRouter.get('/:id', validate({ params: idParam }), asyncHandler(c.getProductController));
productsRouter.post('/', requireSuperAdmin, writeRateLimiter, validate({ body: createProductSchema }), asyncHandler(c.createProductController));
productsRouter.patch('/:id', requireSuperAdmin, validate({ params: idParam, body: updateProductSchema }), asyncHandler(c.updateProductController));
productsRouter.delete('/:id', requireSuperAdmin, validate({ params: idParam }), asyncHandler(c.deleteProductController));
productsRouter.post('/:id/photo', requireSuperAdmin, validate({ params: idParam }), imageUpload('products').single('file'), asyncHandler(c.uploadProductPhotoController));
productsRouter.get('/:id/bom', validate({ params: idParam }), asyncHandler(c.getBomController));
productsRouter.put('/:id/bom', requireSuperAdmin, validate({ params: idParam, body: setBomSchema }), asyncHandler(c.setBomController));

// ── Raw materials ──
export const rawMaterialsRouter = Router();
rawMaterialsRouter.use(authGuard, requireGodownAccess);
rawMaterialsRouter.get('/', validate({ query: listRawMaterialsQuerySchema }), asyncHandler(c.listRawMaterialsController));
rawMaterialsRouter.post('/', writeRateLimiter, validate({ body: createRawMaterialSchema }), asyncHandler(c.createRawMaterialController));
rawMaterialsRouter.patch('/:id', validate({ params: idParam, body: updateRawMaterialSchema }), asyncHandler(c.updateRawMaterialController));
rawMaterialsRouter.delete('/:id', requireSuperAdmin, validate({ params: idParam }), asyncHandler(c.deleteRawMaterialController));
