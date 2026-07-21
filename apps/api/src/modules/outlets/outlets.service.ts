import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import type {
  CreateOutletInput, OutletProfileInput, SetOutletPricesInput, UpdateOutletInput,
} from './outlets.schema';

const outletSelect = {
  id: true, name: true, code: true, address: true, phone: true, creditPeriodDays: true,
  pricingMode: true, gstBilling: true, ownerUserId: true, isActive: true,
  // The outlet's own business identity — printed on its receipts and shown as the
  // buyer's details on the invoices the main branch raises against it.
  legalName: true, gstin: true, fssaiNumber: true, email: true, receiptFooter: true,
  // Which POS menu this outlet sells from (assigned by the main owner).
  assignedMenuId: true, assignedMenu: { select: { id: true, name: true } },
} as const;

export async function listOutlets() {
  return prisma.outlet.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' }, select: outletSelect });
}

export async function getOutlet(id: string) {
  const outlet = await prisma.outlet.findFirst({ where: { id, isDeleted: false }, select: outletSelect });
  if (!outlet) throw AppError.notFound('Outlet not found');
  return outlet;
}

export async function createOutlet(input: CreateOutletInput, createdById: string) {
  const existing = await prisma.outlet.findFirst({ where: { code: input.code } });
  if (existing) throw AppError.conflict('An outlet with this code already exists', 'code');
  return prisma.outlet.create({ data: { ...input, createdById }, select: outletSelect });
}

export async function updateOutlet(id: string, input: UpdateOutletInput) {
  await getOutlet(id);
  if (input.code) {
    const clash = await prisma.outlet.findFirst({ where: { code: input.code, id: { not: id } } });
    if (clash) throw AppError.conflict('An outlet with this code already exists', 'code');
  }
  return prisma.outlet.update({ where: { id }, data: input, select: outletSelect });
}

/**
 * Assign (or clear) the outlet's POS menu. Main-owner control — not behind the
 * developer window, since it's a routine day-to-day decision. `null` clears the
 * assignment, so the outlet falls back to the default menu at the counter.
 * Busts POS cache so the counter reloads the new menu on its next fetch.
 */
export async function assignMenu(id: string, assignedMenuId: string | null) {
  await getOutlet(id);
  if (assignedMenuId) {
    const menu = await prisma.menu.findFirst({ where: { id: assignedMenuId, isDeleted: false }, select: { id: true } });
    if (!menu) throw AppError.badRequest('That menu does not exist', undefined, 'assignedMenuId');
  }
  const outlet = await prisma.outlet.update({ where: { id }, data: { assignedMenuId }, select: outletSelect });
  cache.invalidateTags(CacheTag.POS, CacheTag.outlet(id));
  return outlet;
}

/**
 * Update the outlet's business identity (address, GSTIN, licence numbers…).
 *
 * Separate from `updateOutlet` on purpose: the main owner maintains these details,
 * while the structural fields — code, pricing mode, credit terms, and creating the
 * outlet at all — stay behind the developer window.
 */
export async function updateOutletProfile(id: string, input: OutletProfileInput) {
  await getOutlet(id);
  return prisma.outlet.update({ where: { id }, data: input, select: outletSelect });
}

/** Every active product with this outlet's special price, if one is set (null = falls back to catalog price). */
export async function getOutletPrices(outletId: string) {
  await getOutlet(outletId);
  const [products, specials] = await Promise.all([
    prisma.product.findMany({
      where: { isDeleted: false, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, sku: true, unit: true, basePrice: true, category: { select: { name: true } } },
    }),
    prisma.outletProductPrice.findMany({ where: { outletId }, select: { productId: true, price: true } }),
  ]);
  const specialMap = new Map(specials.map((s) => [s.productId, s.price]));
  return products.map((p) => ({ ...p, specialPrice: specialMap.get(p.id) ?? null }));
}

/** Replace this outlet's entire special-price list (blank/omitted product = fall back to catalog price). */
export async function setOutletPrices(outletId: string, input: SetOutletPricesInput) {
  await getOutlet(outletId);
  await prisma.$transaction(async (tx) => {
    await tx.outletProductPrice.deleteMany({ where: { outletId } });
    if (input.items.length > 0) {
      await tx.outletProductPrice.createMany({
        data: input.items.map((i) => ({ outletId, productId: i.productId, price: i.price })),
      });
    }
  });
  return getOutletPrices(outletId);
}

export const outletsService = {
  listOutlets, getOutlet, createOutlet, updateOutlet, assignMenu, updateOutletProfile, getOutletPrices, setOutletPrices,
};
