import { ist } from '@/lib/utils';

// Local calendar date, not toISOString() — in IST the latter shifts back 5h30m
// and can quietly land on the wrong day.
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export type PeriodKey = 'today' | 'yesterday' | 'month' | 'all' | 'custom';

export const PERIODS: Array<[PeriodKey, string]> = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['month', 'This Month'],
  ['all', 'All'], ['custom', 'Custom Range'],
];

/** Resolves a period pick to an inclusive from/to pair the API's date filter understands. */
export function periodRange(period: PeriodKey, custom: { from: string; to: string }): { from?: string; to?: string } {
  const n = ist();
  switch (period) {
    case 'today': { const t = iso(n); return { from: t, to: t }; }
    case 'yesterday': { const y = iso(new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1)); return { from: y, to: y }; }
    case 'month': return { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)), to: iso(new Date(n.getFullYear(), n.getMonth() + 1, 0)) };
    case 'custom': return { from: custom.from, to: custom.to };
    case 'all': default: return {};
  }
}
