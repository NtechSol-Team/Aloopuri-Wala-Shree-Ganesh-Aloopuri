import fs from 'node:fs/promises';
import path from 'node:path';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import { assertQuantityPrecision, assertRawMaterialQuantities } from '../../shared/utils/quantity';
import type {
  CreateCategoryInput,
  CreateProductInput,
  CreateRawMaterialInput,
  ListCategoriesQuery,
  ListProductsQuery,
  ListRawMaterialsQuery,
  SetBomInput,
  UpdateCategoryInput,
  UpdateProductInput,
  UpdateRawMaterialInput,
} from './products.schema';

function invalidate(): void {
  cache.invalidateTags(CacheTag.INVENTORY, CacheTag.DASHBOARD);
}

// ─────────────────────────────── Categories ─────────────────────────────────
export async function listCategories(query: ListCategoriesQuery = {}) {
  return cache.getOrSet(`categories:list:${query.type ?? 'all'}`, [CacheTag.INVENTORY], () =>
    prisma.productCategory.findMany({
      where: { isDeleted: false, ...(query.type ? { type: query.type } : {}) },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, description: true, type: true, isActive: true,
        _count: { select: { products: true, rawMaterials: true } },
      },
    }),
  );
}

export async function createCategory(input: CreateCategoryInput, createdById: string) {
  const category = await prisma.productCategory.create({ data: { ...input, createdById } });
  invalidate();
  return category;
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  const category = await prisma.productCategory.update({ where: { id }, data: input });
  invalidate();
  return category;
}

export async function deleteCategory(id: string) {
  const [products, rawMaterials] = await Promise.all([
    prisma.product.count({ where: { categoryId: id, isDeleted: false } }),
    prisma.rawMaterial.count({ where: { categoryId: id, isDeleted: false } }),
  ]);
  const inUse = products + rawMaterials;
  if (inUse > 0) throw AppError.conflict(`This category still has ${inUse} item(s). Reassign them before deleting it.`);
  await prisma.productCategory.update({ where: { id }, data: { isDeleted: true, isActive: false } });
  invalidate();
  return { deleted: true };
}

// ─────────────────────────────── Products ───────────────────────────────────
const productSelect = {
  id: true,
  name: true,
  sku: true,
  basePrice: true,
  mrp: true,
  taxPercent: true,
  reorderLevel: true,
  photoUrl: true,
  batchTrackingEnabled: true,
  isActive: true,
  isPosEnabled: true,
  trackInventory: true,
  avgCost: true,
  category: { select: { id: true, name: true, type: true } },
  unit: { select: { id: true, name: true, decimalPlaces: true } },
  // So the Edit dialog can show what's already on hand before the owner decides
  // how much stock to add — Main Branch isn't included because Add Stock, like
  // Opening Stock, only ever lands at the Godown.
  godownStock: { select: { quantity: true } },
} satisfies Prisma.ProductSelect;

const rawMaterialSelect = {
  id: true,
  name: true,
  supplierName: true,
  reorderLevel: true,
  currentStock: true,
  costPerUnit: true,
  hsnCode: true,
  taxPercent: true,
  isActive: true,
  unit: { select: { id: true, name: true, decimalPlaces: true } },
  category: { select: { id: true, name: true, type: true } },
} satisfies Prisma.RawMaterialSelect;

export async function listProducts(query: ListProductsQuery) {
  return cache.getOrSet(`products:list:${JSON.stringify(query)}`, [CacheTag.INVENTORY], async () => {
    const where: Prisma.ProductWhereInput = {
      isDeleted: false,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      // POS-only items belong solely to the POS screen (served by /pos/products).
      // Everywhere else — orders, purchases, transfers, BOM, production — deals in
      // finished goods, so this endpoint EXCLUDES POS items by default and only
      // returns them when a caller explicitly asks (the POS Items admin page).
      // Defaulting here, rather than trusting each caller to pass the filter, means
      // a POS item can never leak into a finished-goods picker, even from a stale
      // client that omits the parameter.
      isPosEnabled: query.isPosEnabled === undefined ? false : query.isPosEnabled,
      ...(query.search
        ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { sku: { contains: query.search, mode: 'insensitive' } }] }
        : {}),
    };
    const { skip, take } = toSkipTake(query);
    const [rows, total] = await Promise.all([
      prisma.product.findMany({ where, select: productSelect, orderBy: { name: 'asc' }, skip, take }),
      prisma.product.count({ where }),
    ]);
    return { rows, meta: buildPaginationMeta(query, total) };
  });
}

export async function getProduct(id: string) {
  const product = await prisma.product.findFirst({
    where: { id, isDeleted: false },
    include: {
      category: { select: { id: true, name: true, type: true } },
      unit: { select: { id: true, name: true, decimalPlaces: true } },
      bom: {
        where: { isDeleted: false },
        include: {
          rawMaterial: {
            select: { id: true, name: true, costPerUnit: true, unit: { select: { id: true, name: true, decimalPlaces: true } } },
          },
        },
      },
      godownStock: { select: { quantity: true } },
      mainBranchStock: { select: { quantity: true } },
    },
  });
  if (!product) throw AppError.notFound('Product not found');
  return product;
}

export async function createProduct(input: CreateProductInput, createdById: string) {
  const { openingStock, ...productInput } = input;
  const unit = await unitFor(input.unitId);
  assertQuantityPrecision(openingStock, unit, 'openingStock');

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({ data: { ...productInput, createdById }, select: productSelect });
    // Initialise the stock ledgers for this product. Opening stock — if given —
    // lands at the Godown, the canonical starting point for finished goods; from
    // there it moves on through production, transfers and Fulfil.
    await tx.godownStock.create({ data: { productId: created.id, quantity: openingStock } });
    await tx.mainBranchStock.create({ data: { productId: created.id, quantity: 0 } });
    return created;
  });
  invalidate();
  return product;
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  const existing = await getProduct(id);
  const { addStock, ...productInput } = input;

  if (addStock) {
    const unit = await unitFor(input.unitId ?? existing.unitId);
    assertQuantityPrecision(addStock, unit, 'addStock');
  }

  const product = await prisma.$transaction(async (tx) => {
    // Increment first, update+select second — so the Godown quantity the caller
    // gets back already reflects this save, the same read-your-write guarantee
    // every other mutation in this API gives.
    if (addStock) {
      await tx.godownStock.update({ where: { productId: id }, data: { quantity: { increment: addStock } } });
    }
    return tx.product.update({ where: { id }, data: productInput, select: productSelect });
  });
  invalidate();
  return product;
}

export async function setProductPhoto(id: string, photoUrl: string) {
  await getProduct(id);
  return prisma.product.update({ where: { id }, data: { photoUrl }, select: productSelect });
}

export async function removeProductPhoto(id: string) {
  const product = await getProduct(id);
  // Only ever unlink our own uploaded files (served under /uploads/…) — never
  // an external URL a caller could have set, and never anything outside the
  // upload dir even if photoUrl were somehow malformed.
  if (product.photoUrl?.startsWith('/uploads/')) {
    const filePath = path.resolve(process.cwd(), env.UPLOAD_DIR, product.photoUrl.replace(/^\/uploads\//, ''));
    if (filePath.startsWith(path.resolve(process.cwd(), env.UPLOAD_DIR))) {
      await fs.unlink(filePath).catch(() => {}); // already gone is fine
    }
  }
  // '' (not null) — an explicit "no photo" the frontend won't paper over with
  // its keyword-matched stock image, unlike a product that never had one.
  return prisma.product.update({ where: { id }, data: { photoUrl: '' }, select: productSelect });
}

export async function deleteProduct(id: string) {
  const product = await getProduct(id);
  // sku has a DB-level unique constraint that a soft-delete alone doesn't relax — free it
  // up so the same SKU can be reused for a new product later.
  const sku = `${product.sku}__deleted__${Date.now()}`;
  await prisma.product.update({ where: { id }, data: { isDeleted: true, isActive: false, sku } });
  invalidate();
  return { deleted: true };
}

// ─────────────────────────────── BOM ────────────────────────────────────────
export async function getBom(productId: string) {
  await getProduct(productId);
  return prisma.billOfMaterials.findMany({
    where: { productId, isDeleted: false },
    include: {
      rawMaterial: {
        select: { id: true, name: true, costPerUnit: true, unit: { select: { id: true, name: true, decimalPlaces: true } } },
      },
      componentProduct: {
        select: { id: true, name: true, avgCost: true, unit: { select: { id: true, name: true, decimalPlaces: true } } },
      },
    },
  });
}

/**
 * Would adding `componentProductId` as a component of `outputProductId` create a
 * cycle? Walks the component graph from the candidate downward looking for the
 * output product (which would mean the output ends up depending on itself).
 */
async function wouldCreateCycle(outputProductId: string, componentProductId: string): Promise<boolean> {
  if (componentProductId === outputProductId) return true;
  const seen = new Set<string>();
  const stack = [componentProductId];
  while (stack.length) {
    const current = stack.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    const children = await prisma.billOfMaterials.findMany({
      where: { productId: current, isDeleted: false, componentType: 'PRODUCT' },
      select: { componentProductId: true },
    });
    for (const c of children) {
      if (!c.componentProductId) continue;
      if (c.componentProductId === outputProductId) return true;
      stack.push(c.componentProductId);
    }
  }
  return false;
}

/** Replace the entire BOM for a product (transactional). Supports raw-material and finished-product components. */
export async function setBom(productId: string, input: SetBomInput, createdById: string) {
  await getProduct(productId);

  // Dedupe within each kind.
  const rawIds = input.items.flatMap((i) => (i.componentType === 'RAW_MATERIAL' ? [i.rawMaterialId] : []));
  const productIds = input.items.flatMap((i) => (i.componentType === 'PRODUCT' ? [i.componentProductId] : []));
  if (new Set(rawIds).size !== rawIds.length) throw AppError.badRequest('Duplicate raw material in recipe');
  if (new Set(productIds).size !== productIds.length) throw AppError.badRequest('Duplicate component product in recipe');

  // Validate referenced entities exist + guard against cycles.
  if (rawIds.length && (await prisma.rawMaterial.count({ where: { id: { in: rawIds }, isDeleted: false } })) !== rawIds.length)
    throw AppError.badRequest('One or more raw materials are invalid');
  if (productIds.length) {
    if (productIds.includes(productId)) throw AppError.badRequest('A product cannot be an ingredient of itself');
    const valid = await prisma.product.count({ where: { id: { in: productIds }, isDeleted: false } });
    if (valid !== productIds.length) throw AppError.badRequest('One or more component products are invalid');
    for (const cid of productIds) {
      if (await wouldCreateCycle(productId, cid)) {
        throw AppError.badRequest('That component would create a circular recipe (it already depends on this product)');
      }
    }
  }

  // Recipe quantities must respect each component's own unit precision.
  await assertRawMaterialQuantities(
    input.items.flatMap((i) => (i.componentType === 'RAW_MATERIAL' ? [{ rawMaterialId: i.rawMaterialId, quantity: i.quantity }] : [])),
  );

  await prisma.$transaction(async (tx) => {
    await tx.billOfMaterials.deleteMany({ where: { productId } });
    if (input.items.length > 0) {
      await tx.billOfMaterials.createMany({
        data: input.items.map((i) =>
          i.componentType === 'RAW_MATERIAL'
            ? { productId, componentType: 'RAW_MATERIAL' as const, rawMaterialId: i.rawMaterialId, quantity: i.quantity, createdById }
            : { productId, componentType: 'PRODUCT' as const, componentProductId: i.componentProductId, quantity: i.quantity, createdById },
        ),
      });
    }
  });
  invalidate();
  return getBom(productId);
}

// ─────────────────────────────── Raw materials ──────────────────────────────
export async function listRawMaterials(query: ListRawMaterialsQuery) {
  return cache.getOrSet(`raw-materials:list:${JSON.stringify(query)}`, [CacheTag.INVENTORY], async () => {
    const where: Prisma.RawMaterialWhereInput = {
      isDeleted: false,
      ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const { skip, take } = toSkipTake(query);
    let [rows, total] = await Promise.all([
      prisma.rawMaterial.findMany({ where, select: rawMaterialSelect, orderBy: { name: 'asc' }, skip, take }),
      prisma.rawMaterial.count({ where }),
    ]);
    if (query.lowStockOnly) {
      rows = rows.filter((r) => Number(r.currentStock) < Number(r.reorderLevel));
    }
    return { rows, meta: buildPaginationMeta(query, total) };
  });
}

/** The unit a raw material is (or is about to be) counted in. */
async function unitFor(unitId: string) {
  const unit = await prisma.unit.findFirst({ where: { id: unitId, isDeleted: false }, select: { name: true, decimalPlaces: true } });
  if (!unit) throw AppError.badRequest('That unit does not exist', undefined, 'unitId');
  return unit;
}

export async function createRawMaterial(input: CreateRawMaterialInput, createdById: string) {
  const unit = await unitFor(input.unitId);
  assertQuantityPrecision(input.currentStock, unit, 'currentStock');
  assertQuantityPrecision(input.reorderLevel, unit, 'reorderLevel');
  const rm = await prisma.rawMaterial.create({ data: { ...input, createdById }, select: rawMaterialSelect });
  invalidate();
  return rm;
}

export async function updateRawMaterial(id: string, input: UpdateRawMaterialInput) {
  const existing = await prisma.rawMaterial.findFirst({ where: { id, isDeleted: false }, select: { id: true, unitId: true } });
  if (!existing) throw AppError.notFound('Raw material not found');
  const unit = await unitFor(input.unitId ?? existing.unitId);
  if (input.currentStock !== undefined) assertQuantityPrecision(input.currentStock, unit, 'currentStock');
  if (input.reorderLevel !== undefined) assertQuantityPrecision(input.reorderLevel, unit, 'reorderLevel');
  const rm = await prisma.rawMaterial.update({ where: { id }, data: input, select: rawMaterialSelect });
  invalidate();
  return rm;
}

export async function deleteRawMaterial(id: string) {
  const used = await prisma.billOfMaterials.count({ where: { rawMaterialId: id, isDeleted: false } });
  if (used > 0) throw AppError.conflict('Cannot delete a raw material used in a BOM');
  await prisma.rawMaterial.update({ where: { id }, data: { isDeleted: true, isActive: false } });
  invalidate();
  return { deleted: true };
}

export const productsService = {
  listCategories, createCategory, updateCategory, deleteCategory,
  listProducts, getProduct, createProduct, updateProduct, setProductPhoto, removeProductPhoto, deleteProduct,
  getBom, setBom,
  listRawMaterials, createRawMaterial, updateRawMaterial, deleteRawMaterial,
};
