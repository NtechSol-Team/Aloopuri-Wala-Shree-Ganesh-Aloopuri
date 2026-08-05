/**
 * Indian financial year runs 1 April → 31 March. FY 2026-27 starts on 1 April 2026,
 * so anything in Jan–Mar belongs to the year before it.
 *
 * Dates are read in IST, not UTC: a sale at 02:00 IST on 1 April is in the new year,
 * but its UTC timestamp still says 31 March.
 */
import { IST_OFFSET_MINUTES } from '../../config/timezone';

export function financialYearStart(date: Date): number {
  const ist = new Date(date.getTime() + IST_OFFSET_MINUTES * 60_000);
  const year = ist.getUTCFullYear();
  // getUTCMonth is 0-based, so 3 === April.
  return ist.getUTCMonth() >= 3 ? year : year - 1;
}
