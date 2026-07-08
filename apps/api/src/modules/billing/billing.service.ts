import { Prisma, BillStatus, UserRole } from '@prisma/client';
import { addDays } from 'date-fns';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import { nextDocNumber } from '../../shared/utils/docNumber';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import { emitRealtime } from '../../sockets/realtime';
import { RealtimeEvent } from '../../sockets/events';
import { enqueue, JobName } from '../../jobs/queue';
import type { AuthUser } from '../../shared/types/api';
import type { ListBillsQuery } from './billing.schema';

type OrderForBill = Prisma.OutletOrderGetPayload<{
  include: { items: { include: { product: true } }; outlet: true };
}>;

/**
 * Create a bill from a (confirmed) outlet order, inside an existing transaction.
 * Server computes all money — never trusts client amounts. Line items are locked.
 */
export async function createBillForOrderTx(tx: Prisma.TransactionClient, order: OrderForBill, userId: string) {
  const billNumber = await nextDocNumber(tx, 'BILL');
  const now = new Date();

  const items = order.items.map((it) => {
    const qty = new Prisma.Decimal(it.confirmedQuantity ?? it.requestedQuantity);
    const rate = new Prisma.Decimal(it.unitPriceSnapshot ?? it.product.basePrice);
    // Without-GST bills carry no tax at all, regardless of the product's catalog tax rate.
    const taxPercent = order.isGstBill ? new Prisma.Decimal(it.product.taxPercent) : new Prisma.Decimal(0);
    const lineBase = rate.mul(qty);
    const taxAmount = lineBase.mul(taxPercent).div(100);
    return {
      productId: it.productId,
      productNameSnapshot: it.product.name,
      quantity: qty,
      rate,
      taxPercent,
      taxAmount,
      lineTotal: lineBase.add(taxAmount),
      lockedAt: now,
    };
  });

  const subTotal = items.reduce((s, i) => s.add(i.rate.mul(i.quantity)), new Prisma.Decimal(0));
  const taxTotal = items.reduce((s, i) => s.add(i.taxAmount), new Prisma.Decimal(0));
  const grandTotal = subTotal.add(taxTotal);

  return tx.bill.create({
    data: {
      billNumber,
      outletId: order.outletId,
      orderId: order.id,
      billDate: now,
      dueDate: addDays(now, order.outlet.creditPeriodDays),
      subTotal,
      taxTotal,
      grandTotal,
      amountPaid: 0,
      balanceDue: grandTotal,
      status: BillStatus.UNPAID,
      isGstBill: order.isGstBill,
      lockedAt: now,
      createdById: userId,
      items: { create: items },
    },
    include: { items: true, outlet: { select: { name: true } } },
  });
}

/** Post-commit side effects: async PDF generation + realtime notification. */
export async function afterBillGenerated(bill: { id: string; billNumber: string; outletId: string; grandTotal: Prisma.Decimal }) {
  cache.invalidateTags(CacheTag.BILLS, CacheTag.DASHBOARD, CacheTag.outlet(bill.outletId));
  await enqueue(JobName.GENERATE_BILL_PDF, { billId: bill.id });
  await emitRealtime(
    RealtimeEvent.BILL_GENERATED,
    { billId: bill.id, billNumber: bill.billNumber, grandTotal: Number(bill.grandTotal) },
    { global: true, outletId: bill.outletId },
  );
}

function scopeFilter(user: AuthUser): Prisma.BillWhereInput {
  if (user.role === UserRole.FRANCHISE_OWNER || user.role === UserRole.CASHIER) {
    return { outletId: user.outletId ?? '__none__' };
  }
  return {};
}

export async function listBills(user: AuthUser, query: ListBillsQuery) {
  const where: Prisma.BillWhereInput = {
    isDeleted: false,
    ...scopeFilter(user),
    ...(query.outletId ? { outletId: query.outletId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.overdueOnly ? { status: { in: ['UNPAID', 'PARTIALLY_PAID'] }, dueDate: { lt: new Date() } } : {}),
    ...(query.from || query.to
      ? { billDate: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } }
      : {}),
  };
  const { skip, take } = toSkipTake(query);
  const orderBy: Prisma.BillOrderByWithRelationInput =
    query.sort === 'amount' ? { grandTotal: 'desc' } : query.sort === 'dueDate' ? { dueDate: 'asc' } : { billDate: 'desc' };

  const [rows, total] = await Promise.all([
    prisma.bill.findMany({
      where, orderBy, skip, take,
      select: {
        id: true, billNumber: true, billDate: true, dueDate: true, grandTotal: true, amountPaid: true, balanceDue: true,
        status: true, pdfUrl: true, isGstBill: true, outlet: { select: { id: true, name: true } },
      },
    }),
    prisma.bill.count({ where }),
  ]);
  // Flag overdue for the client.
  const now = new Date();
  const decorated = rows.map((b) => ({ ...b, isOverdue: b.status !== 'PAID' && b.dueDate < now }));
  return { rows: decorated, meta: buildPaginationMeta(query, total) };
}

export async function getBill(user: AuthUser, id: string) {
  const bill = await prisma.bill.findFirst({
    where: { id, isDeleted: false, ...scopeFilter(user) },
    include: { items: true, outlet: true, payments: { where: { isDeleted: false }, orderBy: { paymentDate: 'desc' } } },
  });
  if (!bill) throw AppError.notFound('Bill not found');
  return bill;
}

export async function regeneratePdf(user: AuthUser, id: string) {
  const bill = await getBill(user, id);
  await enqueue(JobName.GENERATE_BILL_PDF, { billId: bill.id });
  return { queued: true };
}

export const billingService = { createBillForOrderTx, afterBillGenerated, listBills, getBill, regeneratePdf };
