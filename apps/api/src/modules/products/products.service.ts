import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import type {
  CreateCategoryInput,
  CreateProductInput,
  CreateRawMaterialInput,
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
export async function listCategories() {
  return prisma.productCategory.findMany({
    where: { isDeleted: false },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, description: true, isActive: true, _count: { select: { products: true } } },
  });
}

export async function createCategory(input: CreateCategoryInput, createdById: string) {
  return prisma.productCategory.create({ data: { ...input, createdById } });
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  return prisma.productCategory.update({ where: { id }, data: input });
}

export async function deleteCategory(id: string) {
  const count = await prisma.product.count({ where: { categoryId: id, isDeleted: false } });
  if (count > 0) throw AppError.conflict('Cannot delete a category that still has products');
  await prisma.productCategory.update({ where: { id }, data: { isDeleted: true, isActive: false } });
  return { deleted: true };
}

// ─────────────────────────────── Products ───────────────────────────────────
const productSelect = {
  id: true,
  name: true,
  sku: true,
  unit: true,
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
  category: { select: { id: true, name: true } },
} satisfies Prisma.ProductSelect;

export async function listProducts(query: ListProductsQuery) {
  const where: Prisma.ProductWhereInput = {
    isDeleted: false,
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.isPosEnabled !== undefined ? { isPosEnabled: query.isPosEnabled } : {}),
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
}

export async function getProduct(id: string) {
  const product = await prisma.product.findFirst({
    where: { id, isDeleted: false },
    include: {
      category: { select: { id: true, name: true } },
      bom: { where: { isDeleted: false }, include: { rawMaterial: { select: { id: true, name: true, unit: true, costPerUnit: true } } } },
      godownStock: { select: { quantity: true } },
      mainBranchStock: { select: { quantity: true } },
    },
  });
  if (!product) throw AppError.notFound('Product not found');
  return product;
}

export async function createProduct(input: CreateProductInput, createdById: string) {
  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({ data: { ...input, createdById }, select: productSelect });
    // Initialise the stock ledgers for this product.
    await tx.godownStock.create({ data: { productId: created.id, quantity: 0 } });
    await tx.mainBranchStock.create({ data: { productId: created.id, quantity: 0 } });
    return created;
  });
  invalidate();
  return product;
}

export async function updateProduct(id: string, input: UpdateProductInput) {
  await getProduct(id);
  const product = await prisma.product.update({ where: { id }, data: input, select: productSelect });
  invalidate();
  return product;
}

export async function setProductPhoto(id: string, photoUrl: string) {
  await getProduct(id);
  return prisma.product.update({ where: { id }, data: { photoUrl }, select: productSelect });
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
      rawMaterial: { select: { id: true, name: true, unit: true, costPerUnit: true } },
      componentProduct: { select: { id: true, name: true, unit: true, avgCost: true } },
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
  const where: Prisma.RawMaterialWhereInput = {
    isDeleted: false,
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };
  const { skip, take } = toSkipTake(query);
  let [rows, total] = await Promise.all([
    prisma.rawMaterial.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
    prisma.rawMaterial.count({ where }),
  ]);
  if (query.lowStockOnly) {
    rows = rows.filter((r) => Number(r.currentStock) < Number(r.reorderLevel));
  }
  return { rows, meta: buildPaginationMeta(query, total) };
}

export async function createRawMaterial(input: CreateRawMaterialInput, createdById: string) {
  const rm = await prisma.rawMaterial.create({ data: { ...input, createdById } });
  invalidate();
  return rm;
}

export async function updateRawMaterial(id: string, input: UpdateRawMaterialInput) {
  const existing = await prisma.rawMaterial.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Raw material not found');
  const rm = await prisma.rawMaterial.update({ where: { id }, data: input });
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
  listProducts, getProduct, createProduct, updateProduct, setProductPhoto, deleteProduct,
  getBom, setBom,
  listRawMaterials, createRawMaterial, updateRawMaterial, deleteRawMaterial,
};
