import type { Server as HttpServer } from 'node:http';
import { Server as IOServer, type Socket } from 'socket.io';
import { Client as PgClient } from 'pg';
import { UserRole } from '@prisma/client';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { prisma } from '../config/prisma';
import { verifyAccessToken } from '../shared/utils/jwt';
import {
  PG_NOTIFY_CHANNEL,
  Room,
  RealtimeEvent,
  type EventScope,
  type RealtimeEventName,
  type RealtimeMessage,
} from './events';

let io: IOServer | null = null;
let listenClient: PgClient | null = null;

/**
 * Initialise the real-time layer:
 *  1. Socket.IO server with JWT handshake auth → clients join admin/outlet rooms.
 *  2. A dedicated pg client that LISTENs on the NOTIFY channel and fans events
 *     out to the right Socket.IO rooms. This is the pub/sub backbone (no Redis).
 */
export async function initRealtime(server: HttpServer): Promise<void> {
  io = new IOServer(server, {
    cors: { origin: env.WEB_ORIGIN, credentials: true },
  });

  io.use((socket: Socket, nextFn: (err?: Error) => void) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.headers.authorization?.replace('Bearer ', '') ?? '');
      if (!token) throw new Error('missing token');
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      socket.data.role = payload.role;
      socket.data.outletId = payload.outletId;
      nextFn();
    } catch {
      nextFn(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const role = socket.data.role as UserRole;
    const outletId = socket.data.outletId as string | null;

    if (role === UserRole.SUPER_ADMIN || role === UserRole.GODOWN_MANAGER) {
      void socket.join(Room.ADMIN);
    }
    if (outletId) void socket.join(Room.outlet(outletId));

    logger.debug({ userId: socket.data.userId, role }, 'socket connected');
    socket.on('disconnect', () => logger.debug({ userId: socket.data.userId }, 'socket disconnected'));
  });

  // Dedicated LISTEN connection (Prisma's pool can't hold a persistent LISTEN).
  listenClient = new PgClient({ connectionString: env.DATABASE_URL });
  await listenClient.connect();
  await listenClient.query(`LISTEN ${PG_NOTIFY_CHANNEL}`);
  listenClient.on('notification', (msg) => {
    if (msg.channel !== PG_NOTIFY_CHANNEL || !msg.payload) return;
    try {
      const message = JSON.parse(msg.payload) as RealtimeMessage;
      dispatch(message);
    } catch (err) {
      logger.error({ err, payload: msg.payload }, 'failed to parse NOTIFY payload');
    }
  });
  listenClient.on('error', (err) => logger.error({ err }, 'pg LISTEN client error'));

  logger.info('real-time layer ready (Socket.IO + PG LISTEN/NOTIFY)');
}

function dispatch(message: RealtimeMessage): void {
  if (!io) return;
  if (message.scope.global) io.to(Room.ADMIN).emit(message.event, message);
  if (message.scope.outletId) io.to(Room.outlet(message.scope.outletId)).emit(message.event, message);
}

/**
 * Emit a real-time event. Persisted through Postgres NOTIFY so it works across
 * multiple API instances; the LISTEN client relays it to Socket.IO.
 */
export async function emitRealtime<T>(
  event: RealtimeEventName,
  data: T,
  scope: EventScope = { global: true },
): Promise<void> {
  const message: RealtimeMessage<T> = {
    event,
    scope,
    data,
    emittedAt: new Date().toISOString(),
  };
  // pg_notify payload limit is 8000 bytes; keep event data lean.
  await prisma.$executeRaw`SELECT pg_notify(${PG_NOTIFY_CHANNEL}, ${JSON.stringify(message)})`;
}

export async function shutdownRealtime(): Promise<void> {
  await listenClient?.end().catch(() => undefined);
  io?.close();
}

export { RealtimeEvent };
