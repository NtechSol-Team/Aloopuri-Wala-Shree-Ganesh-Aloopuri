import type { Job } from 'pg-boss';
import { addDays, endOfDay, startOfDay } from 'date-fns';
import { SupplierBillStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { emitRealtime } from '../../sockets/realtime';
import { RealtimeEvent } from '../../sockets/events';

const REMINDER_WINDOWS = [10, 5] as const;

/**
 * Daily sweep: for each supplier bill still owed, fire a reminder when its due
 * date is exactly 10 or 5 days out. Delivered via the existing realtime/toast +
 * notification-bell pipeline — no separate notification store needed.
 */
export async function supplierBillRemindersHandler(_jobs: Job<Record<string, never>>[]): Promise<void> {
  try {
    for (const daysAhead of REMINDER_WINDOWS) {
      const target = addDays(new Date(), daysAhead);
      const bills = await prisma.supplierBill.findMany({
        where: {
          isDeleted: false,
          status: { in: [SupplierBillStatus.UNPAID, SupplierBillStatus.PARTIALLY_PAID] },
          dueDate: { gte: startOfDay(target), lte: endOfDay(target) },
        },
        select: { billNumber: true, supplierName: true, balanceDue: true },
      });
      for (const b of bills) {
        await emitRealtime(
          RealtimeEvent.PAYMENT_DUE_REMINDER,
          { billNumber: b.billNumber, supplierName: b.supplierName, balanceDue: Number(b.balanceDue), daysLeft: daysAhead },
          { global: true },
        );
      }
    }
  } catch (err) {
    logger.error({ err }, 'failed to run supplier-bill reminder sweep');
    throw err;
  }
}
