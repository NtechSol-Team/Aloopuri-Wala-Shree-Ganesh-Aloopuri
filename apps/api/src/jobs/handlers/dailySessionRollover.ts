import type { Job } from 'pg-boss';
import { PosSessionStatus, PosTransactionStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { nextDocNumber } from '../../shared/utils/docNumber';
import { emitRealtime } from '../../sockets/realtime';
import { RealtimeEvent } from '../../sockets/events';

/**
 * Midnight (IST) rollover: any till left open gets auto-closed with its
 * computed cash total (no physical count is possible unattended) and a fresh
 * session opens immediately after for the same outlet, carrying the drawer
 * float forward — so "today's" session always actually starts at 00:00 and
 * can't silently span into the next calendar day again.
 */
export async function dailySessionRolloverHandler(_jobs: Job<Record<string, never>>[]): Promise<void> {
  const openSessions = await prisma.posSession.findMany({
    where: { status: PosSessionStatus.OPEN, isDeleted: false },
  });

  for (const session of openSessions) {
    try {
      const txns = await prisma.posTransaction.findMany({
        where: { sessionId: session.id, isDeleted: false, status: PosTransactionStatus.COMPLETED },
        select: { cashAmount: true },
      });
      const cashCollected = txns.reduce((s, t) => s + Number(t.cashAmount), 0);
      const closingCash = Number(session.openingCash) + cashCollected;

      const newSession = await prisma.$transaction(async (tx) => {
        await tx.posSession.update({
          where: { id: session.id },
          data: { status: PosSessionStatus.CLOSED, closedAt: new Date(), closingCash },
        });
        const sessionNumber = await nextDocNumber(tx, 'POS_SESSION');
        return tx.posSession.create({
          data: {
            sessionNumber,
            outletId: session.outletId,
            openedById: session.openedById,
            openingCash: closingCash,
            status: PosSessionStatus.OPEN,
          },
        });
      });

      await emitRealtime(
        RealtimeEvent.POS_SESSION_ROLLOVER,
        { closedSessionId: session.id, newSessionId: newSession.id, newSessionNumber: newSession.sessionNumber },
        { global: true, outletId: session.outletId },
      );

      logger.info(
        { closedSessionNumber: session.sessionNumber, newSessionNumber: newSession.sessionNumber, outletId: session.outletId, closingCash },
        'daily POS session rollover',
      );
    } catch (err) {
      logger.error({ err, sessionId: session.id }, 'failed to roll over POS session at midnight');
    }
  }
}
