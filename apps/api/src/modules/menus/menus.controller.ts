import type { Request, Response } from 'express';
import { created, ok } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { uploadUrl } from '../../shared/middleware/upload';
import { menusService } from './menus.service';
import type {
  CreateMenuInput, UpdateMenuInput,
  CreateMenuCategoryInput, UpdateMenuCategoryInput,
  CreateMenuItemInput, UpdateMenuItemInput, ReorderMenuItemsInput,
} from './menus.schema';

function actor(req: Request): string {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
}

export const listMenusController = async (_req: Request, res: Response) =>
  ok(res, await menusService.listMenus());
export const getMenuController = async (req: Request, res: Response) =>
  ok(res, await menusService.getMenu(req.params.id));
export const createMenuController = async (req: Request, res: Response) =>
  created(res, await menusService.createMenu(req.body as CreateMenuInput, actor(req)), 'Menu created');
export const updateMenuController = async (req: Request, res: Response) =>
  ok(res, await menusService.updateMenu(req.params.id, req.body as UpdateMenuInput), 'Menu updated');
export const deleteMenuController = async (req: Request, res: Response) =>
  ok(res, await menusService.deleteMenu(req.params.id), 'Menu deleted');

export const createMenuCategoryController = async (req: Request, res: Response) =>
  created(res, await menusService.createMenuCategory(req.params.id, req.body as CreateMenuCategoryInput), 'Category added');
export const updateMenuCategoryController = async (req: Request, res: Response) =>
  ok(res, await menusService.updateMenuCategory(req.params.id, req.params.categoryId, req.body as UpdateMenuCategoryInput), 'Category updated');
export const deleteMenuCategoryController = async (req: Request, res: Response) =>
  ok(res, await menusService.deleteMenuCategory(req.params.id, req.params.categoryId), 'Category removed');

export const createMenuItemController = async (req: Request, res: Response) =>
  created(res, await menusService.createMenuItem(req.params.id, req.body as CreateMenuItemInput), 'Item added');
export const updateMenuItemController = async (req: Request, res: Response) =>
  ok(res, await menusService.updateMenuItem(req.params.id, req.params.itemId, req.body as UpdateMenuItemInput), 'Item updated');
export const deleteMenuItemController = async (req: Request, res: Response) =>
  ok(res, await menusService.deleteMenuItem(req.params.id, req.params.itemId), 'Item removed');
export const reorderMenuItemsController = async (req: Request, res: Response) =>
  ok(res, await menusService.reorderMenuItems(req.params.id, req.body as ReorderMenuItemsInput), 'Order saved');

export const uploadMenuItemPhotoController = async (req: Request, res: Response) => {
  if (!req.file) throw AppError.badRequest('No image uploaded', undefined, 'file');
  const url = uploadUrl('products', req.file.filename);
  return ok(res, await menusService.setMenuItemPhoto(req.params.id, req.params.itemId, url), 'Photo updated');
};
export const removeMenuItemPhotoController = async (req: Request, res: Response) =>
  ok(res, await menusService.removeMenuItemPhoto(req.params.id, req.params.itemId), 'Photo removed');
