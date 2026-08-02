import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';

/**
 * Finished goods + raw materials held at the godown. Queries FROM Product (not
 * GodownStock) and left-joins the stock row, so a product with no GodownStock row yet
 * (e.g. created without Opening Stock) still shows up here at 0 instead of silently
 * disappearing from the register. Excludes trackInventory=false products (POS/menu
 * items made to order, never godown-stocked) — same distinction the Edit Product
 * dialog's "Track finished-goods stock" toggle documents.
 */
export async function getGodown() {
  return cache.getOrSet('inventory:godown', [CacheTag.INVENTORY], async () => {
    const [products, rawMaterials] = await Promise.all([
      prisma.product.findMany({
        where: { isDeleted: false, trackInventory: true },
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, sku: true, reorderLevel: true,
          unit: { select: { id: true, name: true, decimalPlaces: true } },
          godownStock: { select: { quantity: true } },
        },
      }),
      prisma.rawMaterial.findMany({
        where: { isDeleted: false },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, unit: { select: { id: true, name: true, decimalPlaces: true } }, currentStock: true, reorderLevel: true, costPerUnit: true, supplierName: true },
      }),
    ]);
    const finishedGoods = products.map(({ godownStock, ...product }) => ({
      quantity: godownStock?.quantity ?? new Prisma.Decimal(0),
      product,
    }));
    return { finishedGoods, rawMaterials };
  });
}

/** Finished goods at the main branch. */
export async function getMainBranch() {
  return cache.getOrSet('inventory:main-branch', [CacheTag.INVENTORY], () =>
    prisma.mainBranchStock.findMany({
      where: { isDeleted: false, product: { isDeleted: false } },
      orderBy: { product: { name: 'asc' } },
      select: { quantity: true, product: { select: { id: true, name: true, sku: true, unit: { select: { id: true, name: true, decimalPlaces: true } }, reorderLevel: true } } },
    }),
  );
}

/** Stock held at a specific outlet. */
export async function getOutlet(outletId: string) {
  return cache.getOrSet(`inventory:outlet:${outletId}`, [CacheTag.INVENTORY, CacheTag.outlet(outletId)], async () => {
    const outlet = await prisma.outlet.findFirst({ where: { id: outletId, isDeleted: false }, select: { id: true, name: true } });
    if (!outlet) throw AppError.notFound('Outlet not found');
    const items = await prisma.outletStock.findMany({
      where: { outletId, isDeleted: false, product: { isDeleted: false } },
      orderBy: { product: { name: 'asc' } },
      select: { quantity: true, product: { select: { id: true, name: true, sku: true, unit: { select: { id: true, name: true, decimalPlaces: true } } } } },
    });
    return { outlet, items };
  });
}

/** Top-line inventory KPIs across all locations. */
export async function getSummary() {
  return cache.getOrSet('inventory:summary', [CacheTag.INVENTORY, CacheTag.DASHBOARD], async () => {
    const [godownAgg, mainAgg, outletAgg, rawCount, rawLow, fgLow] = await Promise.all([
      prisma.godownStock.aggregate({ _sum: { quantity: true }, where: { isDeleted: false } }),
      prisma.mainBranchStock.aggregate({ _sum: { quantity: true }, where: { isDeleted: false } }),
      prisma.outletStock.aggregate({ _sum: { quantity: true }, where: { isDeleted: false } }),
      prisma.rawMaterial.count({ where: { isDeleted: false, isActive: true } }),
      prisma.$queryRaw<Array<{ c: number }>>`SELECT count(*)::int AS c FROM raw_materials WHERE is_deleted=false AND is_active=true AND current_stock < reorder_level`,
      prisma.$queryRaw<Array<{ c: number }>>`SELECT count(*)::int AS c FROM products p JOIN main_branch_stock m ON m.product_id=p.id WHERE p.is_deleted=false AND p.is_active=true AND m.quantity < p.reorder_level`,
    ]);
    return {
      godownUnits: Number(godownAgg._sum.quantity ?? 0),
      mainBranchUnits: Number(mainAgg._sum.quantity ?? 0),
      outletUnits: Number(outletAgg._sum.quantity ?? 0),
      rawMaterialCount: rawCount,
      lowStockCount: Number(rawLow[0]?.c ?? 0) + Number(fgLow[0]?.c ?? 0),
    };
  });
}

export const inventoryService = { getGodown, getMainBranch, getOutlet, getSummary };
