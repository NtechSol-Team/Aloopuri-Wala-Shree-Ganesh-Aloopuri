import type { Request, Response } from 'express';
import { created, ok, paginated } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { uploadUrl } from '../../shared/middleware/upload';
import { productsService } from './products.service';
import type {
  CreateCategoryInput, CreateProductInput, CreateRawMaterialInput,
  ListProductsQuery, ListRawMaterialsQuery, SetBomInput,
  UpdateCategoryInput, UpdateProductInput, UpdateRawMaterialInput,
} from './products.schema';

function actor(req: Request): string {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
}

// Categories
export const listCategoriesController = async (_req: Request, res: Response) =>
  ok(res, await productsService.listCategories());
export const createCategoryController = async (req: Request, res: Response) =>
  created(res, await productsService.createCategory(req.body as CreateCategoryInput, actor(req)), 'Category created');
export const updateCategoryController = async (req: Request, res: Response) =>
  ok(res, await productsService.updateCategory(req.params.id, req.body as UpdateCategoryInput), 'Category updated');
export const deleteCategoryController = async (req: Request, res: Response) =>
  ok(res, await productsService.deleteCategory(req.params.id), 'Category deleted');

// Products
export const listProductsController = async (req: Request, res: Response) => {
  const { rows, meta } = await productsService.listProducts(req.query as unknown as ListProductsQuery);
  return paginated(res, rows, meta);
};
export const getProductController = async (req: Request, res: Response) =>
  ok(res, await productsService.getProduct(req.params.id));
export const createProductController = async (req: Request, res: Response) =>
  created(res, await productsService.createProduct(req.body as CreateProductInput, actor(req)), 'Product created');
export const updateProductController = async (req: Request, res: Response) =>
  ok(res, await productsService.updateProduct(req.params.id, req.body as UpdateProductInput), 'Product updated');
export const deleteProductController = async (req: Request, res: Response) =>
  ok(res, await productsService.deleteProduct(req.params.id), 'Product deactivated');

export const uploadProductPhotoController = async (req: Request, res: Response) => {
  if (!req.file) throw AppError.badRequest('No image uploaded', undefined, 'file');
  const url = uploadUrl('products', req.file.filename);
  return ok(res, await productsService.setProductPhoto(req.params.id, url), 'Photo updated');
};
export const removeProductPhotoController = async (req: Request, res: Response) =>
  ok(res, await productsService.removeProductPhoto(req.params.id), 'Photo removed');

// BOM
export const getBomController = async (req: Request, res: Response) =>
  ok(res, await productsService.getBom(req.params.id));
export const setBomController = async (req: Request, res: Response) =>
  ok(res, await productsService.setBom(req.params.id, req.body as SetBomInput, actor(req)), 'BOM updated');

// Raw materials
export const listRawMaterialsController = async (req: Request, res: Response) => {
  const { rows, meta } = await productsService.listRawMaterials(req.query as unknown as ListRawMaterialsQuery);
  return paginated(res, rows, meta);
};
export const createRawMaterialController = async (req: Request, res: Response) =>
  created(res, await productsService.createRawMaterial(req.body as CreateRawMaterialInput, actor(req)), 'Raw material created');
export const updateRawMaterialController = async (req: Request, res: Response) =>
  ok(res, await productsService.updateRawMaterial(req.params.id, req.body as UpdateRawMaterialInput), 'Raw material updated');
export const deleteRawMaterialController = async (req: Request, res: Response) =>
  ok(res, await productsService.deleteRawMaterial(req.params.id), 'Raw material deleted');
