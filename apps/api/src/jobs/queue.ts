import PgBoss from 'pg-boss';
import { env } from '../config/env';
import { logger } from '../config/logger';

export const JobName = {
  REFRESH_ANALYTICS: 'refresh-analytics-views',
  GENERATE_BILL_PDF: 'generate-bill-pdf',
} as const;

export type JobNameValue = (typeof JobName)[keyof typeof JobName];

let boss: PgBoss | null = null;

export function getBoss(): PgBoss {
  if (!boss) throw new Error('pg-boss not started — call startJobs() first');
  return boss;
}

/** Enqueue a job (no-op safe before boss starts is avoided by getBoss throw). */
export async function enqueue<T extends object>(name: JobNameValue, data: T): Promise<string | null> {
  return getBoss().send(name, data);
}

/**
 * Start pg-boss, ensure queues exist, register workers, and schedule the
 * recurring materialized-view refresh (every 15 min by default).
 */
export async function startJobs(): Promise<void> {
  boss = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' });
  boss.on('error', (err) => logger.error({ err }, 'pg-boss error'));
  await boss.start();

  for (const name of Object.values(JobName)) {
    await boss.createQueue(name);
  }

  // Lazy-load handlers to avoid circular imports with feature modules.
  const { refreshAnalyticsHandler } = await import('./handlers/refreshAnalytics');
  const { generateBillPdfHandler } = await import('./handlers/generateBillPdf');

  await boss.work(JobName.REFRESH_ANALYTICS, refreshAnalyticsHandler);
  await boss.work(JobName.GENERATE_BILL_PDF, generateBillPdfHandler);

  // Schedule recurring analytics refresh.
  await boss.schedule(JobName.REFRESH_ANALYTICS, env.MATERIALIZED_VIEW_REFRESH_CRON, {});

  logger.info('pg-boss started (queues + scheduled jobs registered)');
}

export async function stopJobs(): Promise<void> {
  await boss?.stop({ graceful: true });
  boss = null;
}
