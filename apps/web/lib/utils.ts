import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional + Tailwind class names with conflict resolution. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Cached formatters: toLocaleString with options builds a fresh Intl.NumberFormat
// per call, and the POS renders 100+ prices per interaction — profiling showed it
// as the single hottest app function on slow tills.
const INR_2DP = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INR_0DP = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Format a number as Indian Rupees. */
export function formatINR(value: number | string, opts: { decimals?: boolean } = {}): string {
  const n = typeof value === 'string' ? Number(value) : value;
  return `₹${(opts.decimals === false ? INR_0DP : INR_2DP).format(Number.isFinite(n) ? n : 0)}`;
}

// Quantity formatters, cached per decimal-place setting for the same reason as the
// INR ones above — inventory/POS tables render hundreds of quantities per paint.
const QTY_FORMATTERS = new Map<number, Intl.NumberFormat>();

/**
 * Format a quantity to the precision its unit allows (Item Master → Unit.decimalPlaces).
 * A Piece unit (0 dp) renders "12", a Kg unit (3 dp) renders "12.500".
 */
export function formatQty(value: number | string, decimalPlaces = 2): string {
  const dp = Math.max(0, Math.min(4, decimalPlaces));
  let fmt = QTY_FORMATTERS.get(dp);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    QTY_FORMATTERS.set(dp, fmt);
  }
  const n = typeof value === 'string' ? Number(value) : value;
  return fmt.format(Number.isFinite(n) ? n : 0);
}

/** Quantity with its unit name appended, e.g. "12.500 Kg". */
export function formatQtyWithUnit(value: number | string, unit: { name: string; decimalPlaces: number }): string {
  return `${formatQty(value, unit.decimalPlaces)} ${unit.name}`;
}

/** Compact number (1.2k, 3.4L). */
export function formatCompact(value: number): string {
  if (value >= 1e7) return `${(value / 1e7).toFixed(2)}Cr`;
  if (value >= 1e5) return `${(value / 1e5).toFixed(2)}L`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(value);
}
