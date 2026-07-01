import { PrismaClient, Prisma } from '@prisma/client';
import { isDev } from './env';
import { logger } from './logger';

function createPrismaClient() {
  return new PrismaClient({
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
