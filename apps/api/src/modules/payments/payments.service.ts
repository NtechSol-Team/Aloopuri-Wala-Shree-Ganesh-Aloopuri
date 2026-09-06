import { Prisma, BillStatus, PaymentChannel, PaymentMethod, PaymentStatus, UserRole } from '@prisma/client';
import { startOfMonth } from 'date-fns';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import { nextDocNumber } from '../../shared/utils/docNumber';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import { emitRealtime } from '../../sockets/realtime';
import { RealtimeEvent } from '../../sockets/events';
import { razorpay, razorpayErrorMessage, verifyCheckoutSignature, verifyWebhookSignature } from '../../config/razorpay';
import { env } from '../../config/env';
import { ordersService } from '../orders/orders.service';
import type { AuthUser } from '../../shared/types/api';
import type { CashPaymentInput, ListPaymentsQuery, ReceivePaymentInput, VerifyRazorpayInput } from './payments.schema';

interface RecordPaymentArgs {
  billId: string;
  amount: Prisma.Decimal;
  channel: PaymentChannel;
  method: PaymentMethod;
  receivedById?: string;
  createdById?: string;
  notes?: string;
  referenceNumber?: string;
  receiptPhotoUrl?: string;
  razorpay?: { orderId: string; paymentId: string; signature: string };
}

/**
 * Record a payment (INSERT-ONLY) and reconcile the bill. Guards against
 * over-payment. All money math is server-side.
 */
async function recordPayment(args: RecordPaymentArgs) {
  const result = await prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findFirst({ where: { id: args.billId, isDeleted: false } });
    if (!bill) throw AppError.notFound('Bill not found');
    if (bill.status === BillStatus.PAID) throw AppError.invalidState('This bill is already fully paid');
    if (bill.status === BillStatus.CANCELLED) throw AppError.invalidState('This bill is cancelled');

    const balance = new Prisma.Decimal(bill.balanceDue);
    if (args.amount.greaterThan(balance)) {
      throw AppError.badRequest(`Amount exceeds balance due (${balance.toString()})`, undefined, 'amount');
    }

    const paymentNumber = await nextDocNumber(tx, 'PAYMENT');
    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        billId: bill.id,
        outletId: bill.outletId,
        channel: args.channel,
        method: args.method,
        amount: args.amount,
        receivedById: args.receivedById,
        createdById: args.createdById,
        notes: args.notes,
        referenceNumber: args.referenceNumber,
        receiptPhotoUrl: args.receiptPhotoUrl,
        status: PaymentStatus.SUCCESS,
        razorpayOrderId: args.razorpay?.orderId,
        razorpayPaymentId: args.razorpay?.paymentId,
        razorpaySignature: args.razorpay?.signature,
      },
    });

    const newPaid = new Prisma.Decimal(bill.amountPaid).add(args.amount);
    const newBalance = new Prisma.Decimal(bill.grandTotal).sub(newPaid);
    const newStatus = newBalance.lessThanOrEqualTo(0) ? BillStatus.PAID : BillStatus.PARTIALLY_PAID;
    const updatedBill = await tx.bill.update({
      where: { id: bill.id },
      data: { amountPaid: newPaid, balanceDue: newBalance, status: newStatus },
      select: { id: true, billNumber: true, status: true, balanceDue: true, outletId: true },
    });

    return { payment, bill: updatedBill };
  });

  cache.invalidateTags(CacheTag.PAYMENTS, CacheTag.BILLS, CacheTag.ORDERS, CacheTag.DASHBOARD, CacheTag.outlet(result.bill.outletId));
  await emitRealtime(
    RealtimeEvent.PAYMENT_RECEIVED,
    { paymentNumber: result.payment.paymentNumber, amount: Number(result.payment.amount), billNumber: result.bill.billNumber, billStatus: result.bill.status },
    { global: true, outletId: result.bill.outletId },
  );
  return result;
}

export async function recordCashPayment(input: CashPaymentInput, user: AuthUser) {
  return recordPayment({
    billId: input.billId,
    amount: new Prisma.Decimal(input.amount),
    // Channel follows the method: only literal cash is CASH, everything else
    // (UPI against the collection QR, a bank transfer) moved digitally even
    // though a person keyed it in.
    channel: input.method === PaymentMethod.CASH ? PaymentChannel.CASH : PaymentChannel.DIGITAL,
    method: input.method,
    receivedById: user.id,
    createdById: user.id,
    notes: input.notes,
    referenceNumber: input.referenceNumber,
    receiptPhotoUrl: input.receiptPhotoUrl,
  });
}

/** Create a Razorpay order for the bill's outstanding balance. */
export async function createRazorpayOrder(billId: string, user: AuthUser) {
  const bill = await prisma.bill.findFirst({ where: { id: billId, isDeleted: false } });
  if (!bill) throw AppError.notFound('Bill not found');
  if (user.role !== UserRole.SUPER_ADMIN && bill.outletId !== user.outletId) throw AppError.forbidden();
  if (bill.status === BillStatus.PAID) throw AppError.invalidState('Bill already paid');

  const amountPaise = Math.round(Number(bill.balanceDue) * 100);
  try {
    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: bill.billNumber,
      notes: { billId: bill.id, outletId: bill.outletId },
    });
    return { orderId: order.id, amount: amountPaise, currency: 'INR', keyId: env.RAZORPAY_KEY_ID };
  } catch (err) {
    throw AppError.payment(`Could not initiate payment: ${razorpayErrorMessage(err)}`);
  }
}

/** Verify the checkout signature and record the digital payment. */
export async function verifyRazorpayPayment(input: VerifyRazorpayInput, user: AuthUser) {
  const valid = verifyCheckoutSignature({
    orderId: input.razorpayOrderId,
    paymentId: input.razorpayPaymentId,
    signature: input.razorpaySignature,
  });
  if (!valid) throw AppError.payment('Payment signature verification failed');

  const bill = await prisma.bill.findFirst({ where: { id: input.billId, isDeleted: false } });
  if (!bill) throw AppError.notFound('Bill not found');
  if (user.role !== UserRole.SUPER_ADMIN && bill.outletId !== user.outletId) throw AppError.forbidden();

  // Idempotency: ignore if this payment id was already recorded.
  const existing = await prisma.payment.findFirst({ where: { razorpayPaymentId: input.razorpayPaymentId } });
  if (existing) return { alreadyRecorded: true };

  return recordPayment({
    billId: bill.id,
    amount: new Prisma.Decimal(bill.balanceDue),
    channel: PaymentChannel.DIGITAL,
    method: PaymentMethod.RAZORPAY,
    createdById: user.id,
    razorpay: { orderId: input.razorpayOrderId, paymentId: input.razorpayPaymentId, signature: input.razorpaySignature },
  });
}

/** UNPAID / PARTIALLY_PAID / PAID from what's actually paid against a bill —
 *  the single place every reversal and reconciliation derives status from. */
function deriveBillStatus(amountPaid: Prisma.Decimal, grandTotal: Prisma.Decimal): BillStatus {
  const balance = grandTotal.sub(amountPaid);
  if (balance.lessThanOrEqualTo(0)) return BillStatus.PAID;
  return amountPaid.greaterThan(0) ? BillStatus.PARTIALLY_PAID : BillStatus.UNPAID;
}

/**
 * Reverse a payment recorded by mistake — wrong bill, wrong amount, double
 * entry, whatever. Soft-deletes the payment and re-derives every bill it
 * touched (there can be several — a Receive Payment split FIFO across an
 * outlet's outstanding bills, via PaymentAllocation) from what's actually
 * still left recorded against each, rather than just subtracting figures —
 * that stays correct even if amounts were ever hand-corrected or two
 * reversals land close together. Every other view (Cash Book, Day Book,
 * Financial Position, the Ledger, the Item Sales Report) reads live off
 * Payment.isDeleted and Bill.amountPaid/balanceDue, so nothing else needs
 * touching for the reversal to show up everywhere it should.
 */
export async function deletePayment(id: string) {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id, isDeleted: false }, include: { allocations: true } });
    if (!payment) throw AppError.notFound('Payment not found');

    const billIds = payment.billId ? [payment.billId] : payment.allocations.map((a) => a.billId);
    // A payment held against an order that hasn't been fulfilled yet (pre-instant-
    // bill flow) isn't applied to anything reversible — cancel the order instead.
    // A Receive Payment that came in for more than was owed and became pure
    // outlet credit is different: it never touched a bill by design, and there is
    // still something to undo (the credit itself), so that one proceeds below.
    if (billIds.length === 0 && payment.orderId) {
      throw AppError.invalidState('This payment was never tied to a bill, so there is nothing to reverse it against.');
    }

    await tx.payment.update({ where: { id: payment.id }, data: { isDeleted: true } });

    const updatedBills: Array<{ id: string; billNumber: string; status: BillStatus; amountPaid: Prisma.Decimal; balanceDue: Prisma.Decimal; outletId: string }> = [];
    for (const billId of billIds) {
      const bill = await tx.bill.findFirst({ where: { id: billId, isDeleted: false } });
      if (!bill) continue; // the bill itself is gone; nothing left here to reconcile

      const [directRemaining, allocatedRemaining] = await Promise.all([
        tx.payment.aggregate({ _sum: { amount: true }, where: { billId: bill.id, isDeleted: false, status: PaymentStatus.SUCCESS } }),
        tx.paymentAllocation.aggregate({ _sum: { amount: true }, where: { billId: bill.id, payment: { isDeleted: false, status: PaymentStatus.SUCCESS } } }),
      ]);
      const amountPaid = new Prisma.Decimal(directRemaining._sum.amount ?? 0).add(new Prisma.Decimal(allocatedRemaining._sum.amount ?? 0));
      const balanceDue = new Prisma.Decimal(bill.grandTotal).sub(amountPaid);
      const status = deriveBillStatus(amountPaid, new Prisma.Decimal(bill.grandTotal));

      updatedBills.push(
        await tx.bill.update({
          where: { id: bill.id },
          data: { amountPaid, balanceDue, status },
          select: { id: true, billNumber: true, status: true, amountPaid: true, balanceDue: true, outletId: true },
        }),
      );
    }

    return { payment, bills: updatedBills };
  });

  // The payment's own outletId always exists, even when it never touched a bill
  // (a pure-advance receipt) — invalidate off that rather than only off whatever
  // bills got reconciled, or that case would leave stale outlet-scoped caches.
  const outletIds = new Set(result.bills.map((b) => b.outletId));
  outletIds.add(result.payment.outletId);
  cache.invalidateTags(CacheTag.PAYMENTS, CacheTag.BILLS, CacheTag.ORDERS, CacheTag.DASHBOARD, ...[...outletIds].map((id) => CacheTag.outlet(id)));
  const bills = result.bills.map((b) => ({ billNumber: b.billNumber, status: b.status, amountPaid: b.amountPaid, balanceDue: b.balanceDue }));
  return {
    deleted: true,
    paymentNumber: result.payment.paymentNumber,
    // `bill` is the single-bill case every existing caller already reads (still true
    // for the vast majority of payments); `bills` is the full list for a reversed
    // Receive Payment that had been split across more than one.
    bill: bills[0] ?? null,
    bills,
  };
}

export async function listPayments(user: AuthUser, query: ListPaymentsQuery) {
  const scoped = user.role === UserRole.FRANCHISE_OWNER || user.role === UserRole.CASHIER;
  const where: Prisma.PaymentWhereInput = {
    isDeleted: false,
    ...(scoped ? { outletId: user.outletId ?? '__none__' } : query.outletId ? { outletId: query.outletId } : {}),
    // A Receive Payment split across bills has billId null but an allocation row per
    // bill it touched — match either shape so filtering a bill's own history doesn't
    // silently miss the payments that also covered other bills in the same receipt.
    ...(query.billId ? { OR: [{ billId: query.billId }, { allocations: { some: { billId: query.billId } } }] } : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where, orderBy: { paymentDate: 'desc' }, skip, take,
      select: {
        id: true, paymentNumber: true, amount: true, channel: true, method: true, paymentDate: true,
        referenceNumber: true, notes: true, advanceAmount: true,
        bill: { select: { billNumber: true } }, outlet: { select: { name: true } },
        allocations: { select: { amount: true, bill: { select: { billNumber: true } } } },
      },
    }),
    prisma.payment.count({ where }),
  ]);
  return { rows, meta: buildPaginationMeta(query, total) };
}

// ── Receive Payment: FIFO across an outlet's outstanding bills ──────────────

type OutstandingBillRow = {
  id: string; billNumber: string; billDate: Date; dueDate: Date;
  grandTotal: Prisma.Decimal; amountPaid: Prisma.Decimal; balanceDue: Prisma.Decimal; status: BillStatus;
};

/** Oldest-first — exactly the order Receive Payment allocates against. */
async function fetchOutstandingBills(client: Prisma.TransactionClient | typeof prisma, outletId: string): Promise<OutstandingBillRow[]> {
  return client.bill.findMany({
    where: { outletId, isDeleted: false, status: { in: [BillStatus.UNPAID, BillStatus.PARTIALLY_PAID] } },
    orderBy: [{ billDate: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, billNumber: true, billDate: true, dueDate: true, grandTotal: true, amountPaid: true, balanceDue: true, status: true },
  });
}

async function requireOutlet(outletId: string) {
  const outlet = await prisma.outlet.findFirst({ where: { id: outletId, isDeleted: false } });
  if (!outlet) throw AppError.badRequest('Please select an outlet.', undefined, 'outletId');
  return outlet;
}

/** Every unpaid/partially-paid bill for the outlet, oldest first, plus the total
 *  currently owed — the "View Outstanding Bills" step before an amount is even typed. */
/** Credit sitting against an outlet from past receipts that came in for more
 *  than was owed at the time — tracked separately from bill balances rather
 *  than netted against them, so "what does this outlet owe" and "what credit
 *  do they have on file" stay two distinct, auditable numbers. */
async function getAdvanceBalance(outletId: string): Promise<Prisma.Decimal> {
  const sum = await prisma.payment.aggregate({
    _sum: { advanceAmount: true },
    where: { outletId, isDeleted: false, status: PaymentStatus.SUCCESS },
  });
  return new Prisma.Decimal(sum._sum.advanceAmount ?? 0);
}

export async function getOutstandingBills(outletId: string) {
  const outlet = await requireOutlet(outletId);
  const [bills, advanceBalance] = await Promise.all([fetchOutstandingBills(prisma, outletId), getAdvanceBalance(outletId)]);
  const totalOutstanding = bills.reduce((s, b) => s.add(new Prisma.Decimal(b.balanceDue)), new Prisma.Decimal(0));
  return { outlet: { id: outlet.id, name: outlet.name, isActive: outlet.isActive }, bills, totalOutstanding, advanceBalance };
}

export interface FifoAllocation {
  billId: string; billNumber: string; billDate: Date;
  billAmount: Prisma.Decimal; previouslyPaid: Prisma.Decimal;
  allocated: Prisma.Decimal; newAmountPaid: Prisma.Decimal; newBalanceDue: Prisma.Decimal; newStatus: BillStatus;
}

/**
 * Walk the outlet's outstanding bills oldest-first, applying the received amount
 * to each in turn until it runs out. Never allocates more than a bill's own
 * remaining balance. Whatever is left once every bill is fully settled has
 * nowhere left to go — it comes back as `advanceAmount`, an explicit credit
 * against this outlet rather than being pushed onto some bill past what it owes.
 */
function computeFifo(bills: OutstandingBillRow[], amount: Prisma.Decimal): { allocations: FifoAllocation[]; advanceAmount: Prisma.Decimal } {
  let remaining = amount;
  const allocations: FifoAllocation[] = [];
  for (const bill of bills) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const due = new Prisma.Decimal(bill.balanceDue);
    if (due.lessThanOrEqualTo(0)) continue;
    const applied = Prisma.Decimal.min(remaining, due);
    const newAmountPaid = new Prisma.Decimal(bill.amountPaid).add(applied);
    const grandTotal = new Prisma.Decimal(bill.grandTotal);
    allocations.push({
      billId: bill.id, billNumber: bill.billNumber, billDate: bill.billDate,
      billAmount: grandTotal, previouslyPaid: new Prisma.Decimal(bill.amountPaid),
      allocated: applied, newAmountPaid, newBalanceDue: grandTotal.sub(newAmountPaid),
      newStatus: deriveBillStatus(newAmountPaid, grandTotal),
    });
    remaining = remaining.sub(applied);
  }
  return { allocations, advanceAmount: remaining };
}

/**
 * The Bill Allocation Preview — what a received amount would do, computed fresh
 * off the live bills. This exact computation runs twice: once here to show the
 * user what will happen, and again inside receivePayment's transaction right
 * before committing, to make sure nothing changed underneath them in between.
 */
export async function previewReceivePayment(outletId: string, amount: number) {
  const outlet = await requireOutlet(outletId);
  if (!outlet.isActive) throw AppError.badRequest('This outlet is inactive and cannot receive payments.', undefined, 'outletId');

  const bills = await fetchOutstandingBills(prisma, outletId);
  const totalOutstandingBefore = bills.reduce((s, b) => s.add(new Prisma.Decimal(b.balanceDue)), new Prisma.Decimal(0));
  const { allocations, advanceAmount } = computeFifo(bills, new Prisma.Decimal(amount));
  const totalAllocated = allocations.reduce((s, a) => s.add(a.allocated), new Prisma.Decimal(0));

  return {
    outlet: { id: outlet.id, name: outlet.name },
    totalReceived: new Prisma.Decimal(amount),
    totalOutstandingBefore,
    totalAllocated,
    totalOutstandingAfter: totalOutstandingBefore.sub(totalAllocated),
    advanceAmount,
    allocations,
  };
}

/** Stable string key for an allocation set, for an exact equality check regardless
 *  of row order — rounds to paise so float/Decimal noise never causes a false mismatch. */
function allocationFingerprint(rows: Array<{ billId: string; amount: Prisma.Decimal | number }>): string {
  return rows
    .map((r) => `${r.billId}:${(typeof r.amount === 'number' ? r.amount : r.amount.toNumber()).toFixed(2)}`)
    .sort()
    .join('|');
}

/**
 * Record a receipt and apply it FIFO across the outlet's outstanding bills,
 * atomically. Concurrency and duplication are handled in three layers:
 *
 *  1. Idempotency — `idempotencyKey` is unique; a double-click or a retried
 *     request after a dropped connection replays the same key and gets back
 *     the payment already recorded rather than a second one.
 *  2. Row locking — every outstanding bill for the outlet is locked
 *     (`SELECT ... FOR UPDATE`) for the life of the transaction, so two
 *     simultaneous receipts against the same outlet serialize rather than
 *     both reading the same "before" balances and double-allocating them.
 *  3. Final server-side validation — the FIFO split is recomputed fresh off
 *     the now-locked bills and compared against what the user actually saw
 *     and confirmed on screen; a mismatch (someone else's payment landed
 *     first, in the time between the preview and this request) is refused
 *     rather than silently posted against a different split than was shown.
 */
export async function receivePayment(input: ReceivePaymentInput, user: AuthUser) {
  const existing = await prisma.payment.findFirst({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return formatReceiveResult(await reloadAffectedBills(existing.id), existing, true);

  const result = await prisma.$transaction(async (tx) => {
    const dup = await tx.payment.findFirst({ where: { idempotencyKey: input.idempotencyKey } });
    if (dup) return { payment: dup, bills: await reloadAffectedBills(dup.id, tx), replay: true as const };

    const outlet = await tx.outlet.findFirst({ where: { id: input.outletId, isDeleted: false } });
    if (!outlet) throw AppError.badRequest('Please select an outlet.', undefined, 'outletId');
    if (!outlet.isActive) throw AppError.badRequest('This outlet is inactive and cannot receive payments.', undefined, 'outletId');

    // Lock every bill this receipt could possibly touch for the rest of this
    // transaction — a concurrent receivePayment for the same outlet blocks here
    // until this one commits, instead of both computing FIFO off the same stale
    // "before" balances.
    await tx.$queryRaw`SELECT id FROM bills WHERE outlet_id = ${input.outletId}::uuid AND is_deleted = false AND status IN ('UNPAID', 'PARTIALLY_PAID') FOR UPDATE`;

    const bills = await fetchOutstandingBills(tx, input.outletId);
    const amount = new Prisma.Decimal(input.amount);
    const fresh = computeFifo(bills, amount);

    const confirmedTotal = input.allocations.reduce((s, a) => s + a.amount, 0) + input.advanceAmount;
    if (Math.abs(confirmedTotal - input.amount) > 0.01) {
      throw AppError.badRequest('The allocation does not add up to the amount received. Please review and try again.', undefined, 'amount');
    }

    const freshFingerprint = allocationFingerprint(fresh.allocations.map((a) => ({ billId: a.billId, amount: a.allocated })));
    const confirmedFingerprint = allocationFingerprint(input.allocations);
    if (freshFingerprint !== confirmedFingerprint || Math.abs(fresh.advanceAmount.toNumber() - input.advanceAmount) > 0.01) {
      throw AppError.conflict('The outstanding balance changed. Please refresh the bills and review the allocation again.');
    }

    const paymentNumber = await nextDocNumber(tx, 'PAYMENT', input.paymentDate);
    // A receipt that lands on exactly one bill (the common case) is recorded the
    // same way every existing single-bill payment always has been — billId set
    // directly, no allocation rows — so every reader that joins on it keeps working
    // unchanged. Only a genuine multi-bill split needs the allocation table at all.
    const singleBillId = fresh.allocations.length === 1 && fresh.advanceAmount.equals(0) ? fresh.allocations[0].billId : null;

    const payment = await tx.payment.create({
      data: {
        paymentNumber,
        billId: singleBillId,
        outletId: input.outletId,
        channel: input.method === PaymentMethod.CASH ? PaymentChannel.CASH : PaymentChannel.DIGITAL,
        method: input.method,
        amount,
        paymentDate: input.paymentDate,
        receivedById: user.id,
        createdById: user.id,
        notes: input.notes,
        referenceNumber: input.referenceNumber,
        advanceAmount: fresh.advanceAmount,
        status: PaymentStatus.SUCCESS,
        idempotencyKey: input.idempotencyKey,
      },
    });

    if (!singleBillId && fresh.allocations.length > 0) {
      await tx.paymentAllocation.createMany({
        data: fresh.allocations.map((a) => ({ paymentId: payment.id, billId: a.billId, amount: a.allocated })),
      });
    }

    const updatedBills = [];
    for (const a of fresh.allocations) {
      updatedBills.push(
        await tx.bill.update({
          where: { id: a.billId },
          data: { amountPaid: a.newAmountPaid, balanceDue: a.newBalanceDue, status: a.newStatus },
          select: { id: true, billNumber: true, status: true, amountPaid: true, balanceDue: true, grandTotal: true, outletId: true },
        }),
      );
    }

    return { payment, bills: updatedBills, replay: false as const, outletName: outlet.name };
  });

  cache.invalidateTags(CacheTag.PAYMENTS, CacheTag.BILLS, CacheTag.ORDERS, CacheTag.DASHBOARD, CacheTag.outlet(input.outletId));
  if (!result.replay) {
    await emitRealtime(
      RealtimeEvent.PAYMENT_RECEIVED,
      { paymentNumber: result.payment.paymentNumber, amount: Number(result.payment.amount), outletName: result.outletName, billsAffected: result.bills.length },
      { global: true, outletId: input.outletId },
    );
  }
  return formatReceiveResult(result.bills, result.payment, result.replay);
}

/** Every bill a given payment (direct or split) currently touches, as they stand right now. */
async function reloadAffectedBills(paymentId: string, client: Prisma.TransactionClient | typeof prisma = prisma) {
  const payment = await client.payment.findFirst({ where: { id: paymentId }, include: { allocations: true } });
  if (!payment) return [];
  const billIds = payment.billId ? [payment.billId] : payment.allocations.map((a) => a.billId);
  if (billIds.length === 0) return [];
  return client.bill.findMany({
    where: { id: { in: billIds } },
    select: { id: true, billNumber: true, status: true, amountPaid: true, balanceDue: true, grandTotal: true, outletId: true },
  });
}

function formatReceiveResult(
  bills: Array<{ billNumber: string; status: BillStatus; amountPaid: Prisma.Decimal; balanceDue: Prisma.Decimal; grandTotal: Prisma.Decimal }>,
  payment: { paymentNumber: string; amount: Prisma.Decimal; advanceAmount: Prisma.Decimal },
  alreadyRecorded: boolean,
) {
  return {
    alreadyRecorded,
    paymentNumber: payment.paymentNumber,
    amountReceived: payment.amount,
    advanceAmount: payment.advanceAmount,
    bills: bills.map((b) => ({ billNumber: b.billNumber, status: b.status, amountPaid: b.amountPaid, balanceDue: b.balanceDue, grandTotal: b.grandTotal })),
  };
}

/**
 * Per-outlet payment ledger: one row per (bill, payment-applied-to-it) pair,
 * showing exactly how each receipt was allocated — including a receipt that
 * also covered other bills, where "received" (the whole receipt) and
 * "adjusted" (this bill's share of it) genuinely differ. "Pending" is the
 * running balance on that bill immediately after this particular payment
 * landed, not today's balance, so history reads the way it happened.
 */
export async function getOutletPaymentHistory(outletId: string) {
  const outlet = await requireOutlet(outletId);

  const bills = await prisma.bill.findMany({
    where: { outletId, isDeleted: false, status: { not: BillStatus.CANCELLED } },
    select: { id: true, billNumber: true, grandTotal: true },
  });
  const billMap = new Map(bills.map((b) => [b.id, b]));
  if (billMap.size === 0) return { outlet: { id: outlet.id, name: outlet.name }, rows: [] };

  const [directPayments, allocationRows] = await Promise.all([
    prisma.payment.findMany({
      where: { outletId, isDeleted: false, status: PaymentStatus.SUCCESS, billId: { in: [...billMap.keys()] } },
      select: { paymentNumber: true, paymentDate: true, amount: true, method: true, billId: true, referenceNumber: true },
    }),
    prisma.paymentAllocation.findMany({
      where: { billId: { in: [...billMap.keys()] }, payment: { isDeleted: false, status: PaymentStatus.SUCCESS } },
      select: {
        billId: true, amount: true,
        payment: { select: { paymentNumber: true, paymentDate: true, amount: true, method: true, referenceNumber: true } },
      },
    }),
  ]);

  type Row = { billId: string; date: Date; paymentNumber: string; received: Prisma.Decimal; adjusted: Prisma.Decimal; method: PaymentMethod; referenceNumber: string | null };
  const rows: Row[] = [
    ...directPayments.map((p) => ({
      billId: p.billId as string, date: p.paymentDate, paymentNumber: p.paymentNumber,
      received: new Prisma.Decimal(p.amount), adjusted: new Prisma.Decimal(p.amount), method: p.method, referenceNumber: p.referenceNumber,
    })),
    ...allocationRows.map((a) => ({
      billId: a.billId, date: a.payment.paymentDate, paymentNumber: a.payment.paymentNumber,
      received: new Prisma.Decimal(a.payment.amount), adjusted: new Prisma.Decimal(a.amount), method: a.payment.method, referenceNumber: a.payment.referenceNumber,
    })),
  ];

  const byBill = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byBill.has(r.billId)) byBill.set(r.billId, []);
    byBill.get(r.billId)!.push(r);
  }

  const ledger: Array<{
    date: Date; billNumber: string; billAmount: Prisma.Decimal; received: Prisma.Decimal;
    adjusted: Prisma.Decimal; pending: Prisma.Decimal; method: PaymentMethod; paymentNumber: string; referenceNumber: string | null;
  }> = [];

  for (const [billId, billRows] of byBill) {
    const bill = billMap.get(billId);
    if (!bill) continue;
    const grandTotal = new Prisma.Decimal(bill.grandTotal);
    // Oldest first so the running "pending" figure reflects what was actually
    // outstanding right after each payment, not a reconstruction in display order.
    billRows.sort((a, b) => a.date.getTime() - b.date.getTime());
    let runningPaid = new Prisma.Decimal(0);
    for (const r of billRows) {
      runningPaid = runningPaid.add(r.adjusted);
      const pending = grandTotal.sub(runningPaid);
      ledger.push({
        date: r.date, billNumber: bill.billNumber, billAmount: grandTotal, received: r.received, adjusted: r.adjusted,
        pending: pending.lessThan(0) ? new Prisma.Decimal(0) : pending,
        method: r.method, paymentNumber: r.paymentNumber, referenceNumber: r.referenceNumber,
      });
    }
  }

  ledger.sort((a, b) => b.date.getTime() - a.date.getTime());
  return { outlet: { id: outlet.id, name: outlet.name }, rows: ledger };
}

/** Payment dashboard: receivables, overdue, outlet-wise outstanding, aging. */
export async function getPaymentSummary(user: AuthUser) {
  const scoped = user.role === UserRole.FRANCHISE_OWNER ? user.outletId ?? '__none__' : undefined;
  const cacheKey = `payments:summary:${scoped ?? 'GLOBAL'}`;

  return cache.getOrSet(cacheKey, [CacheTag.PAYMENTS, CacheTag.BILLS], async () => {
    const outstandingWhere: Prisma.BillWhereInput = {
      isDeleted: false,
      status: { in: [BillStatus.UNPAID, BillStatus.PARTIALLY_PAID] },
      ...(scoped ? { outletId: scoped } : {}),
    };

    const [receivables, collectedThisMonth, byOutlet, aging] = await Promise.all([
      prisma.bill.aggregate({ _sum: { balanceDue: true }, where: outstandingWhere }),
      prisma.payment.aggregate({ _sum: { amount: true }, where: { isDeleted: false, paymentDate: { gte: startOfMonth(new Date()) }, ...(scoped ? { outletId: scoped } : {}) } }),
      prisma.bill.groupBy({ by: ['outletId'], _sum: { balanceDue: true }, where: outstandingWhere }),
      agingReport(scoped),
    ]);

    // Resolve outlet names for the outstanding breakdown.
    const outletIds = byOutlet.map((b) => b.outletId);
    const outlets = await prisma.outlet.findMany({ where: { id: { in: outletIds } }, select: { id: true, name: true } });
    const nameOf = new Map(outlets.map((o) => [o.id, o.name]));

    return {
      totalReceivables: Number(receivables._sum.balanceDue ?? 0),
      collectedThisMonth: Number(collectedThisMonth._sum.amount ?? 0),
      overdueAmount: aging.buckets.reduce((s, b) => (b.label !== 'current' ? s + b.amount : s), 0),
      outletOutstanding: byOutlet
        .map((b) => ({ outletId: b.outletId, outletName: nameOf.get(b.outletId) ?? 'Unknown', outstanding: Number(b._sum.balanceDue ?? 0) }))
        .sort((a, b) => b.outstanding - a.outstanding),
      aging: aging.buckets,
    };
  });
}

async function agingReport(outletId?: string) {
  // Days overdue buckets on outstanding bills.
  const rows = await prisma.$queryRawUnsafe<Array<{ bucket: string; amount: number }>>(
    `SELECT
        CASE
          WHEN due_date >= now() THEN 'current'
          WHEN now()::date - due_date::date BETWEEN 1 AND 7 THEN '1-7'
          WHEN now()::date - due_date::date BETWEEN 8 AND 15 THEN '8-15'
          WHEN now()::date - due_date::date BETWEEN 16 AND 30 THEN '16-30'
          ELSE '30+'
        END AS bucket,
        COALESCE(SUM(balance_due), 0)::float AS amount
      FROM bills
      WHERE is_deleted = false AND status IN ('UNPAID','PARTIALLY_PAID')
        ${outletId ? `AND outlet_id = '${outletId}'::uuid` : ''}
      GROUP BY 1`,
  );
  const order = ['current', '1-7', '8-15', '16-30', '30+'];
  const map = new Map(rows.map((r) => [r.bucket, r.amount]));
  return { buckets: order.map((label) => ({ label, amount: map.get(label) ?? 0 })) };
}

/**
 * Razorpay webhook (backup to client-side verify). Verifies the signature, then
 * idempotently records captured payments by mapping the order back to its bill.
 */
export async function handleWebhook(rawBody: Buffer, signature: string, body: RazorpayWebhookBody) {
  if (!verifyWebhookSignature(rawBody, signature)) {
    throw AppError.badRequest('Invalid webhook signature', undefined, 'signature');
  }
  if (body.event !== 'payment.captured') return { ignored: true };

  const entity = body.payload?.payment?.entity;
  if (!entity?.id || !entity.order_id) return { ignored: true };

  const existing = await prisma.payment.findFirst({ where: { razorpayPaymentId: entity.id } });
  if (existing) return { alreadyRecorded: true };

  const order = await razorpay.orders.fetch(entity.order_id);
  const notes = order.notes as Record<string, string> | undefined;

  // Checkout against an outlet ORDER (pay-before-confirm): the order's bill doesn't
  // exist yet, so hand off to the orders module, which raises the bill, records the
  // payment and confirms the order in one transaction. This is the safety net for a
  // payment that succeeded after the outlet's browser closed mid-checkout.
  if (notes?.orderId) {
    return ordersService.confirmPaidOrderFromWebhook(notes.orderId, {
      razorpayOrderId: entity.order_id,
      razorpayPaymentId: entity.id,
    });
  }

  const billId = notes?.billId;
  if (!billId) return { ignored: true };

  const bill = await prisma.bill.findFirst({ where: { id: billId, isDeleted: false } });
  if (!bill || bill.status === BillStatus.PAID || bill.status === BillStatus.CANCELLED) return { ignored: true };

  const captured = new Prisma.Decimal(entity.amount).div(100);
  const balance = new Prisma.Decimal(bill.balanceDue);
  const amount = captured.greaterThan(balance) ? balance : captured;
  if (amount.lessThanOrEqualTo(0)) return { ignored: true };

  await recordPayment({
    billId: bill.id,
    amount,
    channel: PaymentChannel.DIGITAL,
    method: PaymentMethod.RAZORPAY,
    razorpay: { orderId: entity.order_id, paymentId: entity.id, signature: 'webhook' },
  });
  return { recorded: true };
}

interface RazorpayWebhookBody {
  event: string;
  payload?: { payment?: { entity?: { id?: string; order_id?: string; amount: number } } };
}

export const paymentsService = {
  recordCashPayment,
  createRazorpayOrder,
  verifyRazorpayPayment,
  listPayments,
  getPaymentSummary,
  handleWebhook,
  deletePayment,
  getOutstandingBills,
  previewReceivePayment,
  receivePayment,
  getOutletPaymentHistory,
};
