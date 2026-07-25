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

/** Compact number (1.2k, 3.4L). */
export function formatCompact(value: number): string {
  if (value >= 1e7) return `${(value / 1e7).toFixed(2)}Cr`;
  if (value >= 1e5) return `${(value / 1e5).toFixed(2)}L`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(value);
}
