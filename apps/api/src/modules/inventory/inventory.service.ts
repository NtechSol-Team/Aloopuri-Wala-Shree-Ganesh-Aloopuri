import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/utils/AppError';

/** Finished goods + raw materials held at the godown. */
export async function getGodown() {
  const [finishedGoods, rawMaterials] = await Promise.all([
    prisma.godownStock.findMany({
      where: { isDeleted: false, product: { isDeleted: false } },
      orderBy: { product: { name: 'asc' } },
      select: { quantity: true, product: { select: { id: true, name: true, sku: true, unit: true, reorderLevel: true } } },
    }),
    prisma.rawMaterial.findMany({
      where: { isDeleted: false },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, unit: true, currentStock: true, reorderLevel: true, costPerUnit: true, supplierName: true },
    }),
  ]);
  return { finishedGoods, rawMaterials };
}

/** Finished goods at the main branch. */
export async function getMainBranch() {
  return prisma.mainBranchStock.findMany({
    where: { isDeleted: false, product: { isDeleted: false } },
    orderBy: { product: { name: 'asc' } },
    select: { quantity: true, product: { select: { id: true, name: true, sku: true, unit: true, reorderLevel: true } } },
  });
}

/** Stock held at a specific outlet. */
export async function getOutlet(outletId: string) {
  const outlet = await prisma.outlet.findFirst({ where: { id: outletId, isDeleted: false }, select: { id: true, name: true } });
  if (!outlet) throw AppError.notFound('Outlet not found');
  const items = await prisma.outletStock.findMany({
    where: { outletId, isDeleted: false, product: { isDeleted: false } },
    orderBy: { product: { name: 'asc' } },
    select: { quantity: true, product: { select: { id: true, name: true, sku: true, unit: true } } },
  });
  return { outlet, items };
}

/** Top-line inventory KPIs across all locations. */
export async function getSummary() {
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
}

export const inventoryService = { getGodown, getMainBranch, getOutlet, getSummary };
