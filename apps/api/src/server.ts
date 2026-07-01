import { createServer } from 'node:http';
import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { createApp } from './app';
import { initRealtime, shutdownRealtime } from './sockets/realtime';
import { startJobs, stopJobs } from './jobs/queue';

async function bootstrap(): Promise<void> {
  // Verify DB connectivity before accepting traffic.
  await prisma.$queryRaw`SELECT 1`;
  logger.info('database connection ok');

  const app = createApp();
  const server = createServer(app);

  await initRealtime(server);
  await startJobs();

  server.listen(env.API_PORT, () => {
    logger.info(`🚀 API listening on http://localhost:${env.API_PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down...');
    server.close();
    await Promise.allSettled([stopJobs(), shutdownRealtime(), prisma.$disconnect()]);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'failed to start server');
  process.exit(1);
});
