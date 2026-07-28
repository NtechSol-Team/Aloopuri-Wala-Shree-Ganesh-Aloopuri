import { subHours } from 'date-fns';
import { prisma } from '../../config/prisma';

export interface MetricPoint {
  at: string;
  loadAvg1: number;
  loadAvg5: number;
  loadAvg15: number;
  memUsedPct: number;
  /** Bytes since the previous sample. Null for the first point in the window,
   *  or where either sample is missing its counters (non-Linux / failed read). */
  netRxBytes: number | null;
  netTxBytes: number | null;
}

/**
 * Recent server samples with per-interval network deltas.
 *
 * The stored counters are cumulative-since-boot, so the deltas are derived here
 * by diffing consecutive rows rather than at write time. That keeps the sampling
 * job stateless: it never has to remember a previous value that would be lost on
 * every deploy/restart (which would then produce one bogus spike each time).
 */
export async function getRecentSamples(hours = 24): Promise<MetricPoint[]> {
  const rows = await prisma.serverMetricSample.findMany({
    where: { createdAt: { gte: subHours(new Date(), hours) } },
    orderBy: { createdAt: 'asc' },
  });

  return rows.map((r, i) => {
    const prev = i > 0 ? rows[i - 1] : null;
    // A counter that went backwards means the machine rebooted; report null
    // rather than a negative or absurdly large "usage" figure.
    const delta = (curr: bigint | null, before: bigint | null | undefined): number | null => {
      if (curr == null || before == null || curr < before) return null;
      return Number(curr - before);
    };
    return {
      at: r.createdAt.toISOString(),
      loadAvg1: r.loadAvg1,
      loadAvg5: r.loadAvg5,
      loadAvg15: r.loadAvg15,
      memUsedPct: r.memUsedPct,
      netRxBytes: delta(r.netRxBytesTotal, prev?.netRxBytesTotal),
      netTxBytes: delta(r.netTxBytesTotal, prev?.netTxBytesTotal),
    };
  });
}

export const developerMetricsService = { getRecentSamples };
