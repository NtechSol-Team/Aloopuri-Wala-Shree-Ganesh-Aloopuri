import { PrismaClient, Prisma } from '@prisma/client';
import { env, isDev } from './env';
import { logger } from './logger';
import { IST_TZ } from './timezone';

/**
 * Prisma's default pool size is derived from CPU count, which on a small
 * droplet works out to only ~5 connections for the whole API process — far
 * too few once several dashboard widgets, POS terminals, and background jobs
 * all want a connection at once. Force explicit sizing instead (see
 * DB_POOL_SIZE / DB_POOL_TIMEOUT_SECONDS in env.ts); this only adds the
 * params if the URL doesn't already specify them, so a deployment-specific
 * override in DATABASE_URL itself still wins.
 */
function poolSizedDatabaseUrl(): string {
  const url = new URL(env.DATABASE_URL);
  if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', String(env.DB_POOL_SIZE));
  if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', String(env.DB_POOL_TIMEOUT_SECONDS));
  // Pin the session to IST so date_trunc(), now() and current_date bucket by the
  // Indian calendar day, matching the Node process (see config/timezone.ts). A
  // managed Postgres defaults to UTC, which used to roll "today" over at 05:30
  // IST and file the first few hours of each morning under the previous day.
  if (!url.searchParams.has('options')) url.searchParams.set('options', `-c timezone=${IST_TZ}`);
  return url.toString();
}

function createPrismaClient() {
  return new PrismaClient({
    datasources: { db: { url: poolSizedDatabaseUrl() } },
    // Event-based logging so warnings/errors flow through pino.
    log: [
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  });
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

// Singleton. In dev, reuse across tsx hot-reloads to avoid pool exhaustion.
const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrismaClient };

export const prisma: ExtendedPrismaClient = globalForPrisma.prisma ?? createPrismaClient();

prisma.$on('warn', (e: Prisma.LogEvent) => logger.warn({ prisma: e }, 'prisma warning'));
prisma.$on('error', (e: Prisma.LogEvent) => logger.error({ prisma: e }, 'prisma error'));

if (isDev) globalForPrisma.prisma = prisma;

export { Prisma };
