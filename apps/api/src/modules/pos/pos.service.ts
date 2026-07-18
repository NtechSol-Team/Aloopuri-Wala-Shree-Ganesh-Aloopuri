import { startOfDay } from 'date-fns';
import { Prisma, KotStatus, PosPaymentMode, PosSessionStatus, PosTransactionStatus, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import { nextDocNumber } from '../../shared/utils/docNumber';
import { emitRealtime } from '../../sockets/realtime';
import { RealtimeEvent } from '../../sockets/events';
import type { AuthUser } from '../../shared/types/api';
import type { CreateTransactionInput, OpenSessionInput, UpdateKotInput, VoidTransactionInput } from './pos.schema';

/**
 * Reserve the next daily order-token for a POS location. Uses DocumentCounter
 * with a per-outlet-per-day key so it is atomic under concurrency and resets
 * every day (key: TOKEN:<outlet|MAIN>:<yyyymmdd>).
 */
async function nextTokenNumber(tx: Prisma.TransactionClient, outletId: string | null): Promise<number> {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const key = `TOKEN:${outletId ?? 'MAIN'}:${day}`;
  const counter = await tx.documentCounter.upsert({
    where: { key },
    create: { key, value: BigInt(1) },
    update: { value: { increment: BigInt(1) } },
    select: { value: true },
  });
  return Number(counter.value);
}

/** Resolve the outlet a POS session/sale belongs to. Admin without outlet = main branch (null). */
function resolveOutlet(user: AuthUser, requested?: string): string | null {
  if (user.role === UserRole.SUPER_ADMIN) return requested ?? null;
  if (!user.outletId) throw AppError.forbidden('Your account is not linked to an outlet');
  return user.outletId;
}

export async function openSession(user: AuthUser, input: OpenSessionInput) {
  const outletId = resolveOutlet(user, input.outletId);
  const existing = await prisma.posSession.findFirst({
    where: { status: PosSessionStatus.OPEN, isDeleted: false, outletId: outletId ?? null },
  });
  if (existing) throw AppError.conflict('An open POS session already exists for this location');

  const session = await prisma.$transaction(async (tx) => {
    const sessionNumber = await nextDocNumber(tx, 'POS_SESSION');
    return tx.posSession.create({
      data: { sessionNumber, outletId, openedById: user.id, openingCash: input.openingCash, status: PosSessionStatus.OPEN },
    });
  });
  return session;
}

export async function getCurrentSession(user: AuthUser) {
  const outletId = resolveOutlet(user, undefined);
  return prisma.posSession.findFirst({
    where: { status: PosSessionStatus.OPEN, isDeleted: false, outletId: outletId ?? null },
  });
}

export async function closeSession(user: AuthUser, id: string, closingCash: number) {
  const session = await prisma.posSession.findFirst({ where: { id, isDeleted: false } });
  if (!session) throw AppError.notFound('Session not found');
  if (session.status === PosSessionStatus.CLOSED) throw AppError.invalidState('Session already closed');
  if (user.role !== UserRole.SUPER_ADMIN && session.outletId !== user.outletId) throw AppError.forbidden();

  return prisma.posSession.update({
    where: { id },
    data: { status: PosSessionStatus.CLOSED, closedAt: new Date(), closingCash },
  });
}

export async function getSessionSummary(id: string) {
  const session = await prisma.posSession.findFirst({ where: { id, isDeleted: false } });
  if (!session) throw AppError.notFound('Session not found');
  const txns = await prisma.posTransaction.findMany({ where: { sessionId: id, isDeleted: false } });
  const completed = txns.filter((t) => t.status === PosTransactionStatus.COMPLETED);
  const voids = txns.filter((t) => t.status === PosTransactionStatus.VOID);
  const sum = (sel: (t: (typeof txns)[number]) => Prisma.Decimal) => completed.reduce((s, t) => s + Number(sel(t)), 0);

  // A till session can span past midnight if a shift doesn't close out (e.g. left
  // open overnight) — totalSales above is deliberately its full lifetime, since the
  // EOD dialog needs that for cash-drawer reconciliation. But the terminal's on-screen
  // "Sales" stat should read like the Dashboard's "Today's Sales" (same outlet, same
  // calendar day), or the two numbers visibly disagree.
  const todayAgg = await prisma.posTransaction.aggregate({
    _sum: { grandTotal: true },
    _count: true,
    where: {
      status: PosTransactionStatus.COMPLETED,
      isDeleted: false,
      soldAt: { gte: startOfDay(new Date()) },
      // Always scope to this till's own location. A main-branch session has
      // outletId null, which must mean "main branch only" (outlet_id IS NULL) —
      // never "no filter", or the counter would total up every outlet's sales.
      outletId: session.outletId,
    },
  });

  return {
    sessionNumber: session.sessionNumber,
    status: session.status,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    openingCash: Number(session.openingCash),
    totalSales: sum((t) => t.grandTotal),
    cashCollected: sum((t) => t.cashAmount),
    cardCollected: sum((t) => t.cardAmount),
    upiCollected: sum((t) => t.upiAmount),
    transactionCount: completed.length,
    voidCount: voids.length,
    todaySales: Number(todayAgg._sum.grandTotal ?? 0),
    todayTransactionCount: todayAgg._count,
  };
}

/** Stock model: outlet sessions hit outlet_stock; main-branch sessions hit main_branch_stock. */
function stockModel(outletId: string | null) {
  return outletId
    ? {
        find: (tx: Prisma.TransactionClient, productId: string) => tx.outletStock.findUnique({ where: { outletId_productId: { outletId, productId } } }),
        dec: (tx: Prisma.TransactionClient, productId: string, qty: Prisma.Decimal) => tx.outletStock.update({ where: { outletId_productId: { outletId, productId } }, data: { quantity: { decrement: qty } } }),
        inc: (tx: Prisma.TransactionClient, productId: string, qty: Prisma.Decimal) =>
          tx.outletStock.upsert({ where: { outletId_productId: { outletId, productId } }, create: { outletId, productId, quantity: qty }, update: { quantity: { increment: qty } } }),
      }
    : {
        find: (tx: Prisma.TransactionClient, productId: string) => tx.mainBranchStock.findUnique({ where: { productId } }),
        dec: (tx: Prisma.TransactionClient, productId: string, qty: Prisma.Decimal) => tx.mainBranchStock.update({ where: { productId }, data: { quantity: { decrement: qty } } }),
        inc: (tx: Prisma.TransactionClient, productId: string, qty: Prisma.Decimal) =>
          tx.mainBranchStock.upsert({ where: { productId }, create: { productId, quantity: qty }, update: { quantity: { increment: qty } } }),
      };
}

export async function createTransaction(user: AuthUser, input: CreateTransactionInput) {
  // Offline idempotency: replays with the same clientUuid return the original sale.
  if (input.clientUuid) {
    const dupe = await prisma.posTransaction.findUnique({ where: { clientUuid: input.clientUuid }, include: { items: true } });
    if (dupe) return dupe;
  }

  const session = await prisma.posSession.findFirst({ where: { id: input.sessionId, isDeleted: false } });
  if (!session) throw AppError.notFound('POS session not found');
  if (session.status !== PosSessionStatus.OPEN) throw AppError.invalidState('POS session is closed');
  if (user.role !== UserRole.SUPER_ADMIN && session.outletId !== user.outletId) throw AppError.forbidden();

  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, isDeleted: false } });
  const productMap = new Map(products.map((p) => [p.id, p]));
  if (productMap.size !== new Set(productIds).size) throw AppError.badRequest('One or more products are invalid');

  // Compute money server-side.
  let subTotal = new Prisma.Decimal(0);
  let itemDiscountTotal = new Prisma.Decimal(0);
  let taxTotal = new Prisma.Decimal(0);
  const lineData = input.items.map((it) => {
    const p = productMap.get(it.productId)!;
    const unitPrice = new Prisma.Decimal(p.mrp);
    const qty = new Prisma.Decimal(it.quantity);
    const discount = new Prisma.Decimal(it.discount);
    const gross = unitPrice.mul(qty);
    const taxable = gross.sub(discount);
    if (taxable.lessThan(0)) throw AppError.badRequest(`Discount exceeds line total for ${p.name}`);
    // Counter (B2C) prices are GST-INCLUSIVE: the MRP is what the customer pays, and
    // the GST is extracted from within it — tax = amount × rate / (100 + rate) — not
    // added on top. So the line total equals the inclusive price. (The wholesale
    // order→bill path is a proper GST invoice and stays tax-exclusive; that lives in
    // billing.service, not here.)
    const taxPct = new Prisma.Decimal(p.taxPercent);
    const taxAmount = taxPct.greaterThan(0)
      ? taxable.mul(taxPct).div(new Prisma.Decimal(100).add(taxPct))
      : new Prisma.Decimal(0);
    subTotal = subTotal.add(gross);
    itemDiscountTotal = itemDiscountTotal.add(discount);
    taxTotal = taxTotal.add(taxAmount);
    return { productId: p.id, productNameSnapshot: p.name, quantity: qty, unitPrice, discount, taxPercent: taxPct, taxAmount, lineTotal: taxable };
  });

  const billDiscount = new Prisma.Decimal(input.billDiscount);
  // Tax is already inside the prices, so it is NOT added again here.
  const grandTotal = subTotal.sub(itemDiscountTotal).sub(billDiscount);
  if (grandTotal.lessThan(0)) throw AppError.badRequest('Total cannot be negative');

  // Resolve payment split.
  const { cashAmount, cardAmount, upiAmount, cashReceived, changeGiven } = resolvePayment(input, grandTotal);

  const model = stockModel(session.outletId);

  // Untracked products (e.g. made-to-order / resold-as-is counter items) skip the
  // stock check entirely — POS can sell them regardless of any ledger quantity.
  const trackedLines = lineData.filter((line) => productMap.get(line.productId)!.trackInventory);

  const txn = await prisma.$transaction(async (tx) => {
    // Validate + decrement stock — tracked products only.
    for (const line of trackedLines) {
      const stock = await model.find(tx, line.productId);
      if (!stock || new Prisma.Decimal(stock.quantity).lessThan(line.quantity)) {
        throw AppError.insufficientStock(`Not enough stock for ${line.productNameSnapshot}`);
      }
    }
    for (const line of trackedLines) await model.dec(tx, line.productId, line.quantity);

    const receiptNumber = await nextDocNumber(tx, 'POS_RECEIPT');
    const tokenNumber = await nextTokenNumber(tx, session.outletId);
    const created = await tx.posTransaction.create({
      data: {
        receiptNumber, tokenNumber, sessionId: session.id, outletId: session.outletId, status: PosTransactionStatus.COMPLETED,
        orderType: input.orderType, customerName: input.customerName, customerPhone: input.customerPhone,
        subTotal, itemDiscount: itemDiscountTotal, billDiscount, taxTotal, grandTotal,
        paymentMode: input.paymentMode, cashReceived, changeGiven, cashAmount, cardAmount, upiAmount,
        soldById: user.id, soldAt: input.soldAt ?? new Date(),
        clientUuid: input.clientUuid, syncedFromOffline: Boolean(input.soldAt),
        items: { create: lineData },
      },
      include: { items: true },
    });

    await tx.posSession.update({
      where: { id: session.id },
      data: {
        totalSales: { increment: grandTotal }, cashCollected: { increment: cashAmount },
        cardCollected: { increment: cardAmount }, upiCollected: { increment: upiAmount },
      },
    });
    return created;
  });

  cache.invalidateTags(CacheTag.POS, CacheTag.INVENTORY, CacheTag.DASHBOARD, ...(session.outletId ? [CacheTag.outlet(session.outletId)] : []));
  await emitRealtime(RealtimeEvent.POS_SALE, { receiptNumber: txn.receiptNumber, grandTotal: Number(txn.grandTotal) }, { global: true, outletId: session.outletId });
  // Kitchen board: new ticket entering PREPARING.
  await emitRealtime(
    RealtimeEvent.POS_KOT,
    { id: txn.id, tokenNumber: txn.tokenNumber, kotStatus: txn.kotStatus, action: 'created' },
    { global: true, outletId: session.outletId },
  );
  return txn;
}

function resolvePayment(input: CreateTransactionInput, grandTotal: Prisma.Decimal) {
  const zero = new Prisma.Decimal(0);
  if (input.paymentMode === PosPaymentMode.SPLIT) {
    if (!input.split) throw AppError.badRequest('Split amounts are required');
    const total = new Prisma.Decimal(input.split.cash).add(input.split.card).add(input.split.upi);
    if (!total.equals(grandTotal)) throw AppError.badRequest('Split amounts must equal the total');
    return { cashAmount: new Prisma.Decimal(input.split.cash), cardAmount: new Prisma.Decimal(input.split.card), upiAmount: new Prisma.Decimal(input.split.upi), cashReceived: null, changeGiven: null };
  }
  if (input.paymentMode === PosPaymentMode.CASH) {
    const received = new Prisma.Decimal(input.cashReceived ?? grandTotal);
    if (received.lessThan(grandTotal)) throw AppError.badRequest('Cash received is less than the total');
    return { cashAmount: grandTotal, cardAmount: zero, upiAmount: zero, cashReceived: received, changeGiven: received.sub(grandTotal) };
  }
  if (input.paymentMode === PosPaymentMode.CARD) return { cashAmount: zero, cardAmount: grandTotal, upiAmount: zero, cashReceived: null, changeGiven: null };
  return { cashAmount: zero, cardAmount: zero, upiAmount: grandTotal, cashReceived: null, changeGiven: null };
}

export async function voidTransaction(user: AuthUser, id: string, input: VoidTransactionInput) {
  const txn = await prisma.posTransaction.findFirst({ where: { id, isDeleted: false }, include: { items: true, session: true } });
  if (!txn) throw AppError.notFound('Transaction not found');
  if (txn.status === PosTransactionStatus.VOID) throw AppError.invalidState('Already voided');
  if (user.role !== UserRole.SUPER_ADMIN && txn.outletId !== user.outletId) throw AppError.forbidden();

  const model = stockModel(txn.outletId);
  const trackedProductIds = new Set(
    (await prisma.product.findMany({ where: { id: { in: txn.items.map((i) => i.productId) }, trackInventory: true }, select: { id: true } })).map((p) => p.id),
  );
  const updated = await prisma.$transaction(async (tx) => {
    // Restock only items that are actually tracked (nothing was decremented for untracked ones).
    for (const item of txn.items) {
      if (trackedProductIds.has(item.productId)) await model.inc(tx, item.productId, new Prisma.Decimal(item.quantity));
    }
    await tx.posSession.update({
      where: { id: txn.sessionId },
      data: {
        totalSales: { decrement: txn.grandTotal }, cashCollected: { decrement: txn.cashAmount },
        cardCollected: { decrement: txn.cardAmount }, upiCollected: { decrement: txn.upiAmount }, voidCount: { increment: 1 },
      },
    });
    return tx.posTransaction.update({ where: { id }, data: { status: PosTransactionStatus.VOID, voidReason: input.reason } });
  });

  cache.invalidateTags(CacheTag.POS, CacheTag.INVENTORY, CacheTag.DASHBOARD);
  return updated;
}

export async function listTransactions(sessionId: string) {
  return prisma.posTransaction.findMany({
    where: { sessionId, isDeleted: false },
    orderBy: { soldAt: 'desc' },
    include: { items: true },
  });
}

export async function getTransaction(user: AuthUser, id: string) {
  const txn = await prisma.posTransaction.findFirst({ where: { id, isDeleted: false }, include: { items: true } });
  if (!txn) throw AppError.notFound('Transaction not found');
  if (user.role !== UserRole.SUPER_ADMIN && txn.outletId !== user.outletId) throw AppError.forbidden();
  return txn;
}

/** Kitchen board: today's active tickets (PREPARING/READY) for the user's POS location. */
export async function kitchenQueue(user: AuthUser) {
  const outletId = resolveOutlet(user, undefined);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return prisma.posTransaction.findMany({
    where: {
      outletId: outletId ?? null,
      isDeleted: false,
      status: PosTransactionStatus.COMPLETED,
      kotStatus: { in: [KotStatus.PREPARING, KotStatus.READY] },
      soldAt: { gte: startOfDay },
    },
    orderBy: { soldAt: 'asc' },
    select: {
      id: true, tokenNumber: true, kotStatus: true, soldAt: true, customerName: true, orderType: true,
      items: { select: { productNameSnapshot: true, quantity: true } },
    },
  });
}

export async function updateKotStatus(user: AuthUser, id: string, input: UpdateKotInput) {
  const txn = await prisma.posTransaction.findFirst({ where: { id, isDeleted: false } });
  if (!txn) throw AppError.notFound('Transaction not found');
  if (user.role !== UserRole.SUPER_ADMIN && txn.outletId !== user.outletId) throw AppError.forbidden();
  if (txn.status !== PosTransactionStatus.COMPLETED) throw AppError.invalidState('Only completed sales have kitchen tickets');

  const updated = await prisma.posTransaction.update({ where: { id }, data: { kotStatus: input.status } });
  await emitRealtime(
    RealtimeEvent.POS_KOT,
    { id: updated.id, tokenNumber: updated.tokenNumber, kotStatus: updated.kotStatus, action: 'updated' },
    { global: true, outletId: txn.outletId },
  );
  return updated;
}

/** Products with the POS location's current stock, for the product grid. */
export async function posProducts(user: AuthUser) {
  const outletId = resolveOutlet(user, undefined);
  const products = await prisma.product.findMany({
    where: { isDeleted: false, isActive: true, isPosEnabled: true },
    orderBy: [{ displayOrder: 'asc' }, { sku: 'asc' }],
    select: { id: true, name: true, sku: true, unit: true, mrp: true, taxPercent: true, photoUrl: true, trackInventory: true, displayOrder: true, category: { select: { id: true, name: true } } },
  });
  const stocks = outletId
    ? await prisma.outletStock.findMany({ where: { outletId }, select: { productId: true, quantity: true } })
    : await prisma.mainBranchStock.findMany({ select: { productId: true, quantity: true } });
  const stockMap = new Map(stocks.map((s) => [s.productId, Number(s.quantity)]));

  // Units sold per product at this location in the last 30 days — used both to
  // order the grid (best-sellers first) and to flag the quick-pick row.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sold = await prisma.posTransactionItem.groupBy({
    by: ['productId'],
    where: {
      isDeleted: false,
      transaction: { outletId: outletId ?? null, status: PosTransactionStatus.COMPLETED, isDeleted: false, soldAt: { gte: since } },
    },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: 'desc' } },
  });
  const soldMap = new Map(sold.map((t) => [t.productId, Number(t._sum.quantity ?? 0)]));
  const popular = new Set(sold.slice(0, 8).map((t) => t.productId));

  return products
    .map((p) => ({
      ...p,
      stock: p.trackInventory ? stockMap.get(p.id) ?? 0 : null,
      popular: popular.has(p.id),
      soldCount: soldMap.get(p.id) ?? 0,
    }))
    // Manual menu-board order — cashiers drag cards to arrange the grid, saved
    // as displayOrder. Ties (and anything not yet arranged) fall back to SKU so
    // items keep a stable position. The soldCount/popular flags above still
    // drive the "★ Popular" quick-pick row.
    .sort((a, b) => a.displayOrder - b.displayOrder || a.sku.localeCompare(b.sku, undefined, { numeric: true }));
}

/**
 * Persist a manual POS grid order. Accepts the dragged subset only (e.g. one
 * category's cards) with each item's new displayOrder slot; other products are
 * left untouched. Applied in one transaction so the grid can't half-reorder.
 */
export async function reorderProducts(items: Array<{ id: string; displayOrder: number }>) {
  await prisma.$transaction(
    items.map((it) => prisma.product.update({ where: { id: it.id }, data: { displayOrder: it.displayOrder } })),
  );
  return { updated: items.length };
}

export const posService = {
  openSession, getCurrentSession, closeSession, getSessionSummary,
  createTransaction, voidTransaction, listTransactions, getTransaction, posProducts, reorderProducts,
  kitchenQueue, updateKotStatus,
};
