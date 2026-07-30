import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import { nextDocNumber } from '../../shared/utils/docNumber';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import type { CreateAssetInput, ListAssetsQuery, UpdateAssetInput } from './assets.schema';

const assetSelect = {
  id: true,
  assetCode: true,
  name: true,
  description: true,
  serialNumber: true,
  quantity: true,
  purchaseCost: true,
  purchaseDate: true,
  supplierName: true,
  invoiceNumber: true,
  location: true,
  status: true,
  notes: true,
  isActive: true,
  supplierBillId: true,
  supplierBill: { select: { id: true, billNumber: true } },
} satisfies Prisma.AssetSelect;

function invalidate(): void {
  cache.invalidateTags(CacheTag.ASSETS);
}

export async function listAssets(query: ListAssetsQuery) {
  const where: Prisma.AssetWhereInput = {
    isDeleted: false,
    ...(query.status ? { status: query.status } : {}),
    ...(query.location ? { location: query.location } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { assetCode: { contains: query.search, mode: 'insensitive' } },
            { serialNumber: { contains: query.search, mode: 'insensitive' } },
            { supplierName: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [rows, total, totals] = await Promise.all([
    prisma.asset.findMany({ where, select: assetSelect, orderBy: { purchaseDate: 'desc' }, skip, take }),
    prisma.asset.count({ where }),
    // Register-wide value, not just this page — the header figure should not change
    // as you page through.
    prisma.asset.aggregate({ where, _sum: { purchaseCost: true } }),
  ]);
  return {
    rows,
    meta: buildPaginationMeta(query, total),
    totalValue: Number(totals._sum.purchaseCost ?? 0),
  };
}

/**
 * Register a new asset. `assetCode` is minted from the shared document counter, so
 * manual entries and purchase-created ones share one sequence.
 */
export async function createAsset(input: CreateAssetInput, createdById: string) {
  const asset = await prisma.$transaction(async (tx) => {
    const assetCode = await nextDocNumber(tx, 'ASSET');
    return tx.asset.create({ data: { ...input, assetCode, createdById }, select: assetSelect });
  });
  invalidate();
  return asset;
}

export async function updateAsset(id: string, input: UpdateAssetInput) {
  const existing = await prisma.asset.findFirst({ where: { id, isDeleted: false }, select: { id: true } });
  if (!existing) throw AppError.notFound('Asset not found');
  const asset = await prisma.asset.update({ where: { id }, data: input, select: assetSelect });
  invalidate();
  return asset;
}

export async function deleteAsset(id: string) {
  const existing = await prisma.asset.findFirst({
    where: { id, isDeleted: false },
    select: { id: true, supplierBillId: true, assetCode: true },
  });
  if (!existing) throw AppError.notFound('Asset not found');
  // An asset that came from a purchase is owned by that bill — deleting it here would
  // silently reappear the next time the bill is edited (the bill re-applies its lines).
  if (existing.supplierBillId) {
    throw AppError.conflict(
      `${existing.assetCode} came from a purchase bill. Remove it by editing that bill's line instead.`,
    );
  }
  await prisma.asset.update({ where: { id }, data: { isDeleted: true, isActive: false } });
  invalidate();
  return { deleted: true };
}

export const assetsService = { listAssets, createAsset, updateAsset, deleteAsset };
