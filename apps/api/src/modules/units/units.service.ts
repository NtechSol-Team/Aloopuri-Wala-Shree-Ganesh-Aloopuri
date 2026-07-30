import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import type { CreateUnitInput, UpdateUnitInput } from './units.schema';

const unitSelect = {
  id: true,
  name: true,
  decimalPlaces: true,
  isActive: true,
  _count: { select: { products: true, rawMaterials: true, menuItems: true } },
} as const;

function invalidate(): void {
  // Units are embedded in product/raw-material/menu payloads, so a unit edit has to
  // bust those caches too — not just the unit list itself.
  cache.invalidateTags(CacheTag.UNITS, CacheTag.INVENTORY, CacheTag.POS, CacheTag.MENUS);
}

export async function listUnits() {
  return cache.getOrSet('units:list', [CacheTag.UNITS], () =>
    prisma.unit.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' }, select: unitSelect }),
  );
}

async function assertNameFree(name: string, exceptId?: string) {
  const clash = await prisma.unit.findFirst({
    where: { name, isDeleted: false, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw AppError.conflict('A unit with this name already exists', 'name');
}

export async function createUnit(input: CreateUnitInput, createdById: string) {
  await assertNameFree(input.name);
  const unit = await prisma.unit.create({ data: { ...input, createdById }, select: unitSelect });
  invalidate();
  return unit;
}

export async function updateUnit(id: string, input: UpdateUnitInput) {
  const existing = await prisma.unit.findFirst({ where: { id, isDeleted: false }, select: { id: true } });
  if (!existing) throw AppError.notFound('Unit not found');
  if (input.name) await assertNameFree(input.name, id);
  const unit = await prisma.unit.update({ where: { id }, data: input, select: unitSelect });
  invalidate();
  return unit;
}

export async function deleteUnit(id: string) {
  const unit = await prisma.unit.findFirst({ where: { id, isDeleted: false }, select: unitSelect });
  if (!unit) throw AppError.notFound('Unit not found');
  const inUse = unit._count.products + unit._count.rawMaterials + unit._count.menuItems;
  if (inUse > 0) {
    throw AppError.conflict(`This unit is used by ${inUse} item(s). Reassign them before deleting it.`);
  }
  // Soft delete, but free the name for reuse — `name` is @unique across soft-deleted
  // rows too, so leaving it would block ever re-creating a unit with the same name.
  await prisma.unit.update({
    where: { id },
    data: { isDeleted: true, isActive: false, name: `${unit.name}__deleted__${Date.now()}` },
  });
  invalidate();
  return { deleted: true };
}

export const unitsService = { listUnits, createUnit, updateUnit, deleteUnit };
