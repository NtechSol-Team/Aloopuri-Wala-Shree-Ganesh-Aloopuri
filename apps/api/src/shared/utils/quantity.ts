import { prisma } from '../../config/prisma';
import { AppError } from './AppError';

/** How many decimal places a numeric value actually carries. */
export function decimalPlacesOf(value: number): number {
  if (Number.isInteger(value)) return 0;
  // Avoid float-string artifacts ("1e-7", "0.30000000000000004") by normalising first.
  const s = String(Number(value.toFixed(6))).replace(/0+$/, '');
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

/**
 * Enforce a unit's configured decimal precision on entered quantities.
 *
 * This is the system-wide half of the Unit master's `decimalPlaces` setting — the
 * frontend's input `step` is only a hint, so every write path that accepts a quantity
 * validates here against the unit actually attached to the item being counted.
 */
export function assertQuantityPrecision(quantity: number, unit: { name: string; decimalPlaces: number }, field = 'quantity'): void {
  const allowed = unit.decimalPlaces;
  if (decimalPlacesOf(quantity) > allowed) {
    throw AppError.badRequest(
      allowed === 0
        ? `${unit.name} quantities must be whole numbers`
        : `${unit.name} quantities allow at most ${allowed} decimal place(s)`,
      undefined,
      field,
    );
  }
}

/** Units for the given products, keyed by productId. */
export async function unitsByProductId(productIds: string[]): Promise<Map<string, { name: string; decimalPlaces: number }>> {
  const rows = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, unit: { select: { name: true, decimalPlaces: true } } },
  });
  return new Map(rows.map((r) => [r.id, r.unit]));
}

/** Units for the given raw materials, keyed by rawMaterialId. */
export async function unitsByRawMaterialId(rawMaterialIds: string[]): Promise<Map<string, { name: string; decimalPlaces: number }>> {
  const rows = await prisma.rawMaterial.findMany({
    where: { id: { in: rawMaterialIds } },
    select: { id: true, unit: { select: { name: true, decimalPlaces: true } } },
  });
  return new Map(rows.map((r) => [r.id, r.unit]));
}

/**
 * Validate a batch of product-keyed quantity lines in one round trip. Unknown product
 * ids are skipped — the caller's own existence check owns that error.
 */
export async function assertProductQuantities(lines: Array<{ productId: string; quantity: number }>): Promise<void> {
  if (lines.length === 0) return;
  const units = await unitsByProductId(lines.map((l) => l.productId));
  for (const line of lines) {
    const unit = units.get(line.productId);
    if (unit) assertQuantityPrecision(line.quantity, unit);
  }
}

/** Same as `assertProductQuantities`, for raw-material-keyed lines. */
export async function assertRawMaterialQuantities(lines: Array<{ rawMaterialId: string; quantity: number }>): Promise<void> {
  if (lines.length === 0) return;
  const units = await unitsByRawMaterialId(lines.map((l) => l.rawMaterialId));
  for (const line of lines) {
    const unit = units.get(line.rawMaterialId);
    if (unit) assertQuantityPrecision(line.quantity, unit);
  }
}
