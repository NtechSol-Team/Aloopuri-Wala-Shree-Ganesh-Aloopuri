import {
  Prisma, BillStatus, FulfillmentSource, OutletOrderStatus, PaymentStatus,
  StockMovementReason, UserRole,
} from '@prisma/client';
import { addDays } from 'date-fns';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import { nextDocNumber } from '../../shared/utils/docNumber';
import { assertProductQuantities } from '../../shared/utils/quantity';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import { istRange } from '../../shared/utils/date';
import { emitRealtime } from '../../sockets/realtime';
import { RealtimeEvent } from '../../sockets/events';
import { enqueue, JobName } from '../../jobs/queue';
import type { AuthUser } from '../../shared/types/api';
import type { CreateManualBillInput, ListBillsQuery } from './billing.schema';

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
    const rate = new Prisma.Decimal(it.unitPriceSnapshot ?? it.product.mrp);
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
  cache.invalidateTags(CacheTag.BILLS, CacheTag.ORDERS, CacheTag.DASHBOARD, CacheTag.outlet(bill.outletId));
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
  const dateRange = istRange(query.from, query.to);
  const where: Prisma.BillWhereInput = {
    isDeleted: false,
    ...scopeFilter(user),
    ...(query.outletId ? { outletId: query.outletId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.overdueOnly ? { status: { in: ['UNPAID', 'PARTIALLY_PAID'] }, dueDate: { lt: new Date() } } : {}),
    ...(dateRange ? { billDate: dateRange } : {}),
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

/**
 * Record a sale that already happened but never got entered — a franchise forgot to
 * raise it, or it was missed at the time.
 *
 * Deliberately built on the same OutletOrder + Bill pair every other sale produces,
 * rather than a free-floating bill: that is what makes it "behave exactly like a
 * normal sales bill". The order carries the stock movements, the bill carries the
 * money, and every downstream view — sales lists, order summary, ledger, day book,
 * P&L, analytics — picks it up without knowing it was back-entered. The goods
 * physically moved before anyone typed this, so it is created already DELIVERED:
 * stock leaves the godown and lands at the outlet in the same transaction.
 *
 * Nothing here touches POS, which is a separate walk-in counter flow.
 */
export async function createManualBill(user: AuthUser, input: CreateManualBillInput) {
  const outlet = await prisma.outlet.findFirst({
    where: { id: input.outletId, isDeleted: false },
    select: { id: true, name: true, gstBilling: true, creditPeriodDays: true },
  });
  if (!outlet) throw AppError.notFound('Outlet not found');

  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isDeleted: false },
    select: { id: true, name: true, taxPercent: true, trackInventory: true, unit: { select: { decimalPlaces: true } } },
  });
  if (products.length !== new Set(productIds).size) throw AppError.badRequest('One or more products are invalid');
  const productById = new Map(products.map((p) => [p.id, p]));
  await assertProductQuantities(input.items.map((i) => ({ productId: i.productId, quantity: i.quantity })));

  const isGstBill = input.isGstBill ?? outlet.gstBilling;
  const billedAt = input.billDate;

  const { bill } = await prisma.$transaction(async (tx) => {
    const orderNumber = await nextDocNumber(tx, 'ORDER');
    const order = await tx.outletOrder.create({
      data: {
        orderNumber,
        outletId: outlet.id,
        status: OutletOrderStatus.DELIVERED,
        isManualEntry: true,
        // Every stamp sits on the date the sale actually happened, so the order and
        // its bill land in the right period everywhere they're reported.
        orderDate: billedAt,
        confirmedAt: billedAt,
        dispatchedAt: billedAt,
        deliveredAt: billedAt,
        // Left null when the owner opted out of moving stock, so the order tells the
        // truth about whether anything actually left the godown.
        stockDeductedAt: input.deductStock ? billedAt : null,
        fulfillmentSource: FulfillmentSource.GODOWN,
        isGstBill,
        notes: input.notes ?? 'Manual sales bill (back-entry)',
        createdById: user.id,
        items: {
          create: input.items.map((i) => ({
            productId: i.productId,
            requestedQuantity: i.quantity,
            confirmedQuantity: i.quantity,
            unitPriceSnapshot: i.unitPrice,
          })),
        },
      },
      include: { items: { include: { product: true } }, outlet: true },
    });

    // Opting out bills the sale without touching inventory at all — no godown
    // decrement, no outlet increment, no movement row. Writing no movements is also
    // what keeps deleteBill honest later: it reverses what was recorded, so a bill
    // raised this way returns nothing rather than inventing stock.
    for (const item of input.deductStock ? input.items : []) {
      if (!productById.get(item.productId)?.trackInventory) continue;
      const qty = new Prisma.Decimal(item.quantity);
      const stock = await tx.godownStock.upsert({
        where: { productId: item.productId },
        create: { productId: item.productId, quantity: qty.negated() },
        update: { quantity: { increment: qty.negated() } },
        select: { quantity: true },
      });
      await tx.stockMovement.create({
        data: {
          productId: item.productId,
          outletId: outlet.id,
          orderId: order.id,
          reason: StockMovementReason.ORDER_FULFILLED,
          quantityDelta: qty.negated(),
          balanceAfter: stock.quantity,
          notes: `Manual sales bill ${orderNumber} (back-entry)`,
          createdById: user.id,
          createdAt: billedAt,
        },
      });
      await tx.outletStock.upsert({
        where: { outletId_productId: { outletId: outlet.id, productId: item.productId } },
        create: { outletId: outlet.id, productId: item.productId, quantity: qty },
        update: { quantity: { increment: qty } },
      });
    }

    const raised = await createBillForOrderTx(tx, order, user.id);
    // createBillForOrderTx stamps today; a back-entry has to carry its own date.
    const dated = await tx.bill.update({
      where: { id: raised.id },
      data: { billDate: billedAt, dueDate: addDays(billedAt, outlet.creditPeriodDays) },
      select: { id: true, billNumber: true, grandTotal: true },
    });
    return { bill: dated };
  });

  await afterBillGenerated({ ...bill, outletId: outlet.id });
  cache.invalidateTags(
    CacheTag.ORDERS, CacheTag.BILLS, CacheTag.INVENTORY, CacheTag.PAYMENTS,
    CacheTag.ANALYTICS, CacheTag.DASHBOARD, CacheTag.outlet(outlet.id),
  );
  await enqueue(JobName.REFRESH_ANALYTICS, {});
  return getBill(user, bill.id);
}

/**
 * Delete a sales bill and unwind the sale behind it.
 *
 * Reverses in the opposite order to how the sale was made: the goods go back from
 * the outlet to the godown, the bill and its lines leave the books (soft-deleted, so
 * every list/report/analytics view drops them while the numbered document survives),
 * and the order that produced it is marked cancelled so it can't be fulfilled or
 * billed again. Money already banked is refused rather than silently discarded —
 * that is a refund, which this flow deliberately doesn't do.
 */
export async function deleteBill(user: AuthUser, id: string) {
  const bill = await prisma.bill.findFirst({
    where: { id, isDeleted: false },
    include: {
      items: true,
      order: { include: { items: true } },
      payments: { where: { isDeleted: false, status: PaymentStatus.SUCCESS }, select: { id: true, amount: true } },
    },
  });
  if (!bill) throw AppError.notFound('Bill not found');

  const paid = bill.payments.reduce((s, p) => s.add(new Prisma.Decimal(p.amount)), new Prisma.Decimal(0));
  if (paid.greaterThan(0)) {
    throw AppError.invalidState(
      `${bill.billNumber} has ₹${paid.toString()} already paid against it. Refund that payment before deleting the bill.`,
    );
  }

  // Reverse what was actually recorded, not what the order lines imply. A manual
  // bill raised with stock deduction turned off wrote no movements, and a product
  // whose trackInventory was switched off never had any taken — re-deriving from the
  // lines would hand back stock that never left in either case.
  const taken = bill.orderId
    ? await prisma.stockMovement.groupBy({
        by: ['productId'],
        where: {
          orderId: bill.orderId,
          reason: { in: [StockMovementReason.ORDER_PLACED, StockMovementReason.ORDER_FULFILLED] },
        },
        _sum: { quantityDelta: true },
      })
    : [];

  await prisma.$transaction(async (tx) => {
    // Put the goods back. A delivered order moved them godown → outlet, so both legs
    // reverse; one still awaiting fulfilment only ever left the godown.
    for (const row of taken) {
      const qty = new Prisma.Decimal(row._sum.quantityDelta ?? 0).negated();
      if (qty.lessThanOrEqualTo(0)) continue;
      const stock = await tx.godownStock.upsert({
        where: { productId: row.productId },
        create: { productId: row.productId, quantity: qty },
        update: { quantity: { increment: qty } },
        select: { quantity: true },
      });
      await tx.stockMovement.create({
        data: {
          productId: row.productId,
          outletId: bill.outletId,
          orderId: bill.orderId,
          reason: StockMovementReason.ORDER_CANCELLED,
          quantityDelta: qty,
          balanceAfter: stock.quantity,
          notes: `Bill ${bill.billNumber} deleted — stock returned`,
          createdById: user.id,
        },
      });
      if (bill.order?.status === OutletOrderStatus.DELIVERED) {
        await tx.outletStock.updateMany({
          where: { outletId: bill.outletId, productId: row.productId },
          data: { quantity: { decrement: qty } },
        });
      }
    }

    await tx.billItem.updateMany({ where: { billId: bill.id }, data: { isDeleted: true } });
    await tx.bill.update({
      where: { id: bill.id },
      data: { status: BillStatus.CANCELLED, balanceDue: 0, isDeleted: true },
    });
    if (bill.orderId) {
      await tx.outletOrder.update({
        where: { id: bill.orderId },
        data: {
          status: OutletOrderStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledById: user.id,
          cancellationReason: `Sales bill ${bill.billNumber} deleted`,
        },
      });
    }
  });

  cache.invalidateTags(
    CacheTag.BILLS, CacheTag.ORDERS, CacheTag.INVENTORY, CacheTag.PAYMENTS,
    CacheTag.ANALYTICS, CacheTag.DASHBOARD, CacheTag.outlet(bill.outletId),
  );
  // P&L and outlet-sales come from materialized views — rebuild or the deleted sale
  // lingers in analytics until the next scheduled refresh.
  await enqueue(JobName.REFRESH_ANALYTICS, {});
  await emitRealtime(
    RealtimeEvent.BILL_GENERATED,
    { billId: bill.id, billNumber: bill.billNumber, grandTotal: 0, deleted: true },
    { global: true, outletId: bill.outletId },
  );
  return { deleted: true, billNumber: bill.billNumber };
}

export const billingService = {
  createBillForOrderTx, afterBillGenerated, listBills, getBill, regeneratePdf,
  createManualBill, deleteBill,
};
