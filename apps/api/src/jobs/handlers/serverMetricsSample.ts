import os from 'node:os';
import { readFile } from 'node:fs/promises';
import type { Job } from 'pg-boss';
import { subDays } from 'date-fns';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../config/logger';

/**
 * Read cumulative RX/TX byte counters for the configured interface from
 * /proc/net/dev. Linux-only (returns nulls on a dev Mac). The file is a small
 * kernel-backed text table, so this is effectively free.
 *
 * Line format is `iface: rxBytes rxPackets ... (8 rx fields) txBytes ...`, so
 * TX bytes is index 8 of the whitespace-split remainder.
 */
async function readNetworkCounters(): Promise<{ rx: bigint | null; tx: bigint | null }> {
  if (process.platform !== 'linux') return { rx: null, tx: null };
  try {
    const raw = await readFile('/proc/net/dev', 'utf8');
    const iface = env.SERVER_METRICS_NET_INTERFACE;
    const line = raw.split('\n').find((l) => l.trim().startsWith(`${iface}:`));
    if (!line) {
      logger.warn({ iface }, 'server metrics: network interface not found in /proc/net/dev');
      return { rx: null, tx: null };
    }
    const cols = line.split(':')[1].trim().split(/\s+/);
    const rx = cols[0];
    const tx = cols[8];
    if (rx === undefined || tx === undefined) return { rx: null, tx: null };
    return { rx: BigInt(rx), tx: BigInt(tx) };
  } catch (err) {
    logger.warn({ err }, 'server metrics: failed to read /proc/net/dev');
    return { rx: null, tx: null };
  }
}

/**
 * Sample whole-server CPU load, memory and network counters into one row, then
 * prune anything past the retention window. Feeds the developer console's
 * Server Health view; nothing in the app itself reads it.
 */
export async function serverMetricsSampleHandler(_jobs: Job<Record<string, never>>[]): Promise<void> {
  const [loadAvg1, loadAvg5, loadAvg15] = os.loadavg();
  const totalMem = os.totalmem();
  const memUsedPct = totalMem > 0 ? ((totalMem - os.freemem()) / totalMem) * 100 : 0;
  const { rx, tx } = await readNetworkCounters();

  await prisma.serverMetricSample.create({
    data: { loadAvg1, loadAvg5, loadAvg15, memUsedPct, netRxBytesTotal: rx, netTxBytesTotal: tx },
  });

  const cutoff = subDays(new Date(), env.SERVER_METRICS_RETENTION_DAYS);
  const pruned = await prisma.serverMetricSample.deleteMany({ where: { createdAt: { lt: cutoff } } });
  if (pruned.count > 0) logger.debug({ pruned: pruned.count }, 'server metrics: pruned old samples');
}
