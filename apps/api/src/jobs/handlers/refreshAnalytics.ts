import type { Job } from 'pg-boss';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { cache, CacheTag } from '../../config/cache';

/**
 * Refresh the materialized views (created in the audit_and_views migration).
 * CONCURRENTLY requires a unique index on each view. Falls back to a plain
 * refresh if the concurrent variant is unavailable.
 */
export async function refreshAnalyticsHandler(_jobs: Job<Record<string, never>>[]): Promise<void> {
  try {
    await prisma.$executeRawUnsafe('SELECT refresh_analytics_views()');
    cache.invalidateTags(CacheTag.ANALYTICS, CacheTag.DASHBOARD);
    logger.debug('analytics materialized views refreshed');
  } catch (err) {
    logger.error({ err }, 'failed to refresh analytics views');
    throw err;
  }
}
