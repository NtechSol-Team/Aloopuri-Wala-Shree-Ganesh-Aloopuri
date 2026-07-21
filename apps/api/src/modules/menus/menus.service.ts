import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import type {
  CreateMenuInput, UpdateMenuInput,
  CreateMenuCategoryInput, UpdateMenuCategoryInput,
  CreateMenuItemInput, UpdateMenuItemInput,
  ReorderMenuItemsInput,
} from './menus.schema';

// POS reads the assigned menu, so any menu edit must bust the POS cache.
function invalidate(): void {
  cache.invalidateTags(CacheTag.POS);
}

const menuSummarySelect = {
  id: true, name: true, description: true, isDefault: true, isActive: true, createdAt: true,
  _count: { select: { items: { where: { isDeleted: false } }, outlets: { where: { isDeleted: false } } } },
} satisfies Prisma.MenuSelect;

async function getMenuOrThrow(id: string) {
  const menu = await prisma.menu.findFirst({ where: { id, isDeleted: false } });
  if (!menu) throw AppError.notFound('Menu not found');
  return menu;
}

// ─────────────────────────────── Menus ──────────────────────────────────────

export async function listMenus() {
  return prisma.menu.findMany({
    where: { isDeleted: false },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    select: {
      ...menuSummarySelect,
      outlets: { where: { isDeleted: false }, select: { id: true, name: true, code: true } },
    },
  });
}

export async function getMenu(id: string) {
  const menu = await prisma.menu.findFirst({
    where: { id, isDeleted: false },
    select: {
      id: true, name: true, description: true, isDefault: true, isActive: true,
      categories: {
        where: { isDeleted: false },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, name: true, displayOrder: true },
      },
      items: {
        where: { isDeleted: false },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true, name: true, code: true, unit: true, price: true, taxPercent: true,
          photoUrl: true, displayOrder: true, isAvailable: true, categoryId: true,
        },
      },
      outlets: { where: { isDeleted: false }, select: { id: true, name: true, code: true } },
    },
  });
  if (!menu) throw AppError.notFound('Menu not found');
  return menu;
}

export async function createMenu(input: CreateMenuInput, createdById: string) {
  const menu = await prisma.$transaction(async (tx) => {
    const created = await tx.menu.create({
      data: { name: input.name, description: input.description ?? null, createdById },
    });

    // "Import from existing menu" — deep-copy so the new menu is fully
    // independent: editing it later never touches the source menu.
    if (input.importFromMenuId) {
      const source = await tx.menu.findFirst({
        where: { id: input.importFromMenuId, isDeleted: false },
        select: {
          categories: { where: { isDeleted: false }, select: { id: true, name: true, displayOrder: true } },
          items: {
            where: { isDeleted: false },
            select: {
              name: true, code: true, unit: true, price: true, taxPercent: true,
              photoUrl: true, displayOrder: true, isAvailable: true, categoryId: true,
            },
          },
        },
      });
      if (!source) throw AppError.badRequest('The menu to import from was not found', undefined, 'importFromMenuId');

      // Recreate categories, keeping a map from the source category id to the new one.
      const catIdMap = new Map<string, string>();
      for (const c of source.categories) {
        const newCat = await tx.menuCategory.create({
          data: { menuId: created.id, name: c.name, displayOrder: c.displayOrder },
        });
        catIdMap.set(c.id, newCat.id);
      }
      if (source.items.length) {
        await tx.menuItem.createMany({
          data: source.items.map((it) => ({
            menuId: created.id,
            categoryId: it.categoryId ? catIdMap.get(it.categoryId) ?? null : null,
            name: it.name, code: it.code, unit: it.unit, price: it.price, taxPercent: it.taxPercent,
            // Photos are immutable uuid files; sharing the reference across menus
            // is safe (menu-item photo removal never unlinks the file).
            photoUrl: it.photoUrl, displayOrder: it.displayOrder, isAvailable: it.isAvailable,
          })),
        });
      }
    }
    return created;
  });
  invalidate();
  return getMenu(menu.id);
}

export async function updateMenu(id: string, input: UpdateMenuInput) {
  await getMenuOrThrow(id);
  const menu = await prisma.$transaction(async (tx) => {
    // Exactly one default at a time.
    if (input.isDefault === true) {
      await tx.menu.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
    }
    return tx.menu.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description === undefined ? undefined : input.description,
        isActive: input.isActive,
        isDefault: input.isDefault,
      },
    });
  });
  invalidate();
  return menu;
}

export async function deleteMenu(id: string) {
  const menu = await getMenuOrThrow(id);
  if (menu.isDefault) throw AppError.conflict('The default menu cannot be deleted. Make another menu the default first.');
  const assigned = await prisma.outlet.count({ where: { assignedMenuId: id, isDeleted: false } });
  if (assigned > 0) {
    throw AppError.conflict(`This menu is assigned to ${assigned} outlet(s). Reassign them before deleting it.`);
  }
  await prisma.menu.update({ where: { id }, data: { isDeleted: true, isDefault: false } });
  invalidate();
  return { deleted: true };
}

// ────────────────────────────── Categories ──────────────────────────────────

export async function createMenuCategory(menuId: string, input: CreateMenuCategoryInput) {
  await getMenuOrThrow(menuId);
  const max = await prisma.menuCategory.aggregate({ where: { menuId, isDeleted: false }, _max: { displayOrder: true } });
  const category = await prisma.menuCategory.create({
    data: { menuId, name: input.name, displayOrder: (max._max.displayOrder ?? -1) + 1 },
  });
  invalidate();
  return category;
}

export async function updateMenuCategory(menuId: string, categoryId: string, input: UpdateMenuCategoryInput) {
  const cat = await prisma.menuCategory.findFirst({ where: { id: categoryId, menuId, isDeleted: false } });
  if (!cat) throw AppError.notFound('Category not found');
  const updated = await prisma.menuCategory.update({ where: { id: categoryId }, data: input });
  invalidate();
  return updated;
}

export async function deleteMenuCategory(menuId: string, categoryId: string) {
  const cat = await prisma.menuCategory.findFirst({ where: { id: categoryId, menuId, isDeleted: false } });
  if (!cat) throw AppError.notFound('Category not found');
  // Detach items rather than delete them — they just become uncategorised.
  await prisma.$transaction([
    prisma.menuItem.updateMany({ where: { categoryId }, data: { categoryId: null } }),
    prisma.menuCategory.update({ where: { id: categoryId }, data: { isDeleted: true } }),
  ]);
  invalidate();
  return { deleted: true };
}

// ─────────────────────────────── Items ──────────────────────────────────────

/** Validate that a category (if given) belongs to this menu. */
async function assertCategoryInMenu(menuId: string, categoryId: string | null | undefined) {
  if (!categoryId) return;
  const cat = await prisma.menuCategory.findFirst({ where: { id: categoryId, menuId, isDeleted: false }, select: { id: true } });
  if (!cat) throw AppError.badRequest('That category is not part of this menu', undefined, 'categoryId');
}

export async function createMenuItem(menuId: string, input: CreateMenuItemInput) {
  await getMenuOrThrow(menuId);
  await assertCategoryInMenu(menuId, input.categoryId);
  const max = await prisma.menuItem.aggregate({ where: { menuId, isDeleted: false }, _max: { displayOrder: true } });
  const item = await prisma.menuItem.create({
    data: {
      menuId,
      categoryId: input.categoryId ?? null,
      name: input.name,
      code: input.code ?? null,
      unit: input.unit,
      price: new Prisma.Decimal(input.price),
      taxPercent: new Prisma.Decimal(input.taxPercent),
      isAvailable: input.isAvailable,
      displayOrder: (max._max.displayOrder ?? -1) + 1,
    },
  });
  invalidate();
  return item;
}

async function getItemOrThrow(menuId: string, itemId: string) {
  const item = await prisma.menuItem.findFirst({ where: { id: itemId, menuId, isDeleted: false } });
  if (!item) throw AppError.notFound('Menu item not found');
  return item;
}

export async function updateMenuItem(menuId: string, itemId: string, input: UpdateMenuItemInput) {
  await getItemOrThrow(menuId, itemId);
  if (input.categoryId !== undefined) await assertCategoryInMenu(menuId, input.categoryId);
  const item = await prisma.menuItem.update({
    where: { id: itemId },
    data: {
      name: input.name,
      categoryId: input.categoryId === undefined ? undefined : input.categoryId,
      code: input.code === undefined ? undefined : input.code,
      unit: input.unit,
      price: input.price === undefined ? undefined : new Prisma.Decimal(input.price),
      taxPercent: input.taxPercent === undefined ? undefined : new Prisma.Decimal(input.taxPercent),
      isAvailable: input.isAvailable,
    },
  });
  invalidate();
  return item;
}

export async function deleteMenuItem(menuId: string, itemId: string) {
  await getItemOrThrow(menuId, itemId);
  await prisma.menuItem.update({ where: { id: itemId }, data: { isDeleted: true } });
  invalidate();
  return { deleted: true };
}

export async function setMenuItemPhoto(menuId: string, itemId: string, photoUrl: string) {
  await getItemOrThrow(menuId, itemId);
  const item = await prisma.menuItem.update({ where: { id: itemId }, data: { photoUrl } });
  invalidate();
  return item;
}

export async function removeMenuItemPhoto(menuId: string, itemId: string) {
  await getItemOrThrow(menuId, itemId);
  // Deliberately does NOT unlink the file: an imported menu shares the same
  // uuid photo file across menus, so removing it here must not delete a file
  // another menu's item may still reference. '' = explicit "no photo".
  const item = await prisma.menuItem.update({ where: { id: itemId }, data: { photoUrl: '' } });
  invalidate();
  return item;
}

export async function reorderMenuItems(menuId: string, input: ReorderMenuItemsInput) {
  await getMenuOrThrow(menuId);
  await prisma.$transaction(
    input.items.map((it) =>
      prisma.menuItem.updateMany({ where: { id: it.id, menuId }, data: { displayOrder: it.displayOrder } }),
    ),
  );
  invalidate();
  return { updated: input.items.length };
}

export const menusService = {
  listMenus, getMenu, createMenu, updateMenu, deleteMenu,
  createMenuCategory, updateMenuCategory, deleteMenuCategory,
  createMenuItem, updateMenuItem, deleteMenuItem, setMenuItemPhoto, removeMenuItemPhoto, reorderMenuItems,
};
