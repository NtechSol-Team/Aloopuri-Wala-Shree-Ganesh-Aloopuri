import {
  Prisma, BillStatus, FulfillmentSource, OrderPaymentMode, OutletOrderStatus,
  PaymentChannel, PaymentMethod, PaymentStatus, UserRole,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import { nextDocNumber } from '../../shared/utils/docNumber';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import { assertProductQuantities } from '../../shared/utils/quantity';
import { emitRealtime } from '../../sockets/realtime';
import { RealtimeEvent } from '../../sockets/events';
import { razorpay, razorpayErrorMessage, verifyCheckoutSignature } from '../../config/razorpay';
import { env } from '../../config/env';
import { billingService } from '../billing/billing.service';
import type { AuthUser } from '../../shared/types/api';
import type {
  CreateOrderInput, ListOrdersQuery, RejectOrderInput, VerifyOrderPaymentInput,
} from './orders.schema';

const orderInclude = {
  // Franchise ordering prices against MRP, not the internal basePrice cost basis —
  // an outlet order calculates and bills the same way an outlet customer would see.
  items: {
    include: {
      product: {
        select: { id: true, name: true, mrp: true, taxPercent: true, unit: { select: { id: true, name: true, decimalPlaces: true } } },
      },
    },
  },
  outlet: { select: { id: true, name: true, pricingMode: true, gstBilling: true, creditPeriodDays: true } },
  bill: {
    select: {
      id: true, billNumber: true, grandTotal: true, status: true, isGstBill: true, balanceDue: true,
      // Just the most recent payment — enough to print "paid by Cash/UPI" on a
      // reprinted order slip without pulling the whole payment history.
      payments: {
        where: { isDeleted: false },
        select: { method: true },
        orderBy: { paymentDate: 'desc' },
        take: 1,
      },
    },
  },
} satisfies Prisma.OutletOrderInclude;

type OrderWithItems = Prisma.OutletOrderGetPayload<{ include: typeof orderInclude }>;

/**
 * Statuses in which an outlet already has an order in flight. While any of these
 * exist, the outlet cannot place another one — they must receive the current
 * order first (or cancel it, if it hasn't been confirmed yet).
 */
export const ACTIVE_ORDER_STATUSES = [OutletOrderStatus.CONFIRMED] as const;

/** Where confirmed stock is decremented from at dispatch — chosen by the admin when dispatching. */
function sourceStockModel(source: FulfillmentSource) {
  return source === FulfillmentSource.GODOWN
    ? {
        label: 'godown',
        find: (tx: Prisma.TransactionClient, productId: string) => tx.godownStock.findUnique({ where: { productId } }),
        dec: (tx: Prisma.TransactionClient, productId: string, qty: Prisma.Decimal) => tx.godownStock.update({ where: { productId }, data: { quantity: { decrement: qty } } }),
      }
    : {
        label: 'main-branch',
        find: (tx: Prisma.TransactionClient, productId: string) => tx.mainBranchStock.findUnique({ where: { productId } }),
        dec: (tx: Prisma.TransactionClient, productId: string, qty: Prisma.Decimal) => tx.mainBranchStock.update({ where: { productId }, data: { quantity: { decrement: qty } } }),
      };
}

function resolveOutletId(user: AuthUser, requested?: string): string {
  if (user.role === UserRole.SUPER_ADMIN) {
    if (!requested) throw AppError.badRequest('outletId is required when ordering as admin', undefined, 'outletId');
    return requested;
  }
  if (!user.outletId) throw AppError.forbidden('Your account is not linked to an outlet');
  return user.outletId;
}

function assertOwnOutlet(user: AuthUser, outletId: string) {
  if (user.role === UserRole.SUPER_ADMIN) return;
  if (user.outletId !== outletId) throw AppError.forbidden();
}

/**
 * What the outlet owes for this order, from the price/quantity snapshot taken at
 * placement (and possibly adjusted by the main owner while approving a credit
 * order). Mirrors the bill's own arithmetic exactly, so the amount charged at
 * checkout always equals the bill that gets generated on confirmation.
 */
export function orderTotals(order: OrderWithItems) {
  let subTotal = new Prisma.Decimal(0);
  let taxTotal = new Prisma.Decimal(0);
  for (const item of order.items) {
    const qty = new Prisma.Decimal(item.confirmedQuantity ?? item.requestedQuantity);
    const rate = new Prisma.Decimal(item.unitPriceSnapshot ?? item.product.mrp);
    const lineBase = rate.mul(qty);
    const taxPercent = order.isGstBill ? new Prisma.Decimal(item.product.taxPercent) : new Prisma.Decimal(0);
    subTotal = subTotal.add(lineBase);
    taxTotal = taxTotal.add(lineBase.mul(taxPercent).div(100));
  }
  return { subTotal, taxTotal, grandTotal: subTotal.add(taxTotal) };
}

/**
 * Place an order. It goes straight into the fulfilment queue (CONFIRMED) — there
 * is no payment or credit-approval gate in front of it.
 *
 * Prices are still resolved and snapshotted now (outlet special price → catalog
 * MRP), and GST comes from the outlet's billing preference, so the amount the
 * outlet will owe is fixed at placement even though the bill is only raised at
 * Fulfil. The outlet may pay any time from here on: before fulfilment the money
 * is held as an advance against the order, after it against the bill.
 */
export async function createOrder(user: AuthUser, input: CreateOrderInput) {
  const outletId = resolveOutletId(user, input.outletId);

  const blocking = await prisma.outletOrder.findFirst({
    where: { outletId, isDeleted: false, status: { in: [...ACTIVE_ORDER_STATUSES] } },
    orderBy: { orderDate: 'desc' },
    select: { orderNumber: true, status: true },
  });
  if (blocking) {
    throw AppError.invalidState(
      `You already have an order awaiting fulfilment (${blocking.orderNumber}). Please wait for it to be fulfilled before placing a new one.`,
    );
  }

  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isDeleted: false, isActive: true, isPosEnabled: false },
    select: { id: true, mrp: true },
  });
  if (products.length !== new Set(productIds).size) throw AppError.badRequest('One or more products are invalid');
  const priceOf = new Map(products.map((p) => [p.id, p.mrp]));
  await assertProductQuantities(input.items.map((i) => ({ productId: i.productId, quantity: i.requestedQuantity })));

  const outlet = await prisma.outlet.findFirst({ where: { id: outletId, isDeleted: false }, select: { id: true, pricingMode: true, gstBilling: true } });
  if (!outlet) throw AppError.notFound('Outlet not found');

  // Negotiated prices only apply to outlets on SPECIAL pricing; otherwise catalog price.
  const specials = outlet.pricingMode === 'SPECIAL'
    ? await prisma.outletProductPrice.findMany({ where: { outletId, productId: { in: productIds } }, select: { productId: true, price: true } })
    : [];
  const specialOf = new Map(specials.map((s) => [s.productId, s.price]));

  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await nextDocNumber(tx, 'ORDER');
    return tx.outletOrder.create({
      data: {
        orderNumber,
        outletId,
        status: OutletOrderStatus.CONFIRMED,
        confirmedAt: new Date(),
        isGstBill: outlet.gstBilling,
        notes: input.notes,
        createdById: user.id,
        items: {
          create: input.items.map((i) => ({
            productId: i.productId,
            requestedQuantity: i.requestedQuantity,
            // Priced up-front so the outlet can pay immediately. Quantities are
            // taken as ordered; the main owner may still trim them on credit orders.
            confirmedQuantity: i.requestedQuantity,
            unitPriceSnapshot: specialOf.get(i.productId) ?? priceOf.get(i.productId)!,
          })),
        },
      },
      include: orderInclude,
    });
  });

  cache.invalidateTags(CacheTag.ORDERS, CacheTag.DASHBOARD, CacheTag.outlet(outletId));

  // Auto-print trigger: fire the instant the order lands, regardless of what
  // happens next (online payment vs. credit approval) — godown/admin start
  // processing it right away instead of waiting on that approval workflow.
  // Full print-ready data rides in the event itself so the listener never
  // needs a follow-up fetch to print.
  await emitRealtime(
    RealtimeEvent.NEW_ORDER,
    {
      orderId: order.id,
      orderNumber: order.orderNumber,
      outletName: order.outlet.name,
      isGstBill: order.isGstBill,
      orderDate: order.orderDate.toISOString(),
      items: order.items.map((i) => ({
        name: i.product.name,
        // The print payload wants a printable label, not the Unit record.
        unit: i.product.unit.name,
        qty: Number(i.confirmedQuantity ?? i.requestedQuantity),
        price: Number(i.unitPriceSnapshot ?? i.product.mrp),
      })),
      // A just-placed order has no bill and no payment yet, so the slip always
      // prints "collect this much" — which is exactly what the packer needs.
      payment: { status: 'PENDING' as const, amountDue: Number(orderTotals(order).grandTotal) },
    },
    { global: true, outletId },
  );

  return { ...order, totals: numericTotals(order) };
}

export async function listOrders(user: AuthUser, query: ListOrdersQuery) {
  const scoped = user.role === UserRole.FRANCHISE_OWNER || user.role === UserRole.CASHIER;
  const scopeKey = scoped ? (user.outletId ?? '__none__') : (query.outletId ?? '__all__');
  return cache.getOrSet(`orders:list:${scopeKey}:${JSON.stringify(query)}`, [CacheTag.ORDERS], async () => {
    const where: Prisma.OutletOrderWhereInput = {
      isDeleted: false,
      ...(scoped ? { outletId: user.outletId ?? '__none__' } : query.outletId ? { outletId: query.outletId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const { skip, take } = toSkipTake(query);
    const [rows, total] = await Promise.all([
      prisma.outletOrder.findMany({ where, orderBy: { orderDate: 'desc' }, skip, take, include: orderInclude }),
      prisma.outletOrder.count({ where }),
    ]);
    return { rows: rows.map((o) => ({ ...o, totals: numericTotals(o) })), meta: buildPaginationMeta(query, total) };
  });
}

export async function getOrder(user: AuthUser, id: string) {
  const scoped = user.role === UserRole.FRANCHISE_OWNER || user.role === UserRole.CASHIER;
  const order = await prisma.outletOrder.findFirst({
    where: { id, isDeleted: false, ...(scoped ? { outletId: user.outletId ?? '__none__' } : {}) },
    include: orderInclude,
  });
  if (!order) throw AppError.notFound('Order not found');
  return { ...order, totals: numericTotals(order) };
}

/** Totals as plain numbers for the API surface (Decimals don't survive JSON meaningfully). */
function numericTotals(order: OrderWithItems) {
  const t = orderTotals(order);
  return { subTotal: Number(t.subTotal), taxTotal: Number(t.taxTotal), grandTotal: Number(t.grandTotal) };
}

async function loadForTransition(id: string): Promise<OrderWithItems> {
  const order = await prisma.outletOrder.findFirst({ where: { id, isDeleted: false }, include: orderInclude });
  if (!order) throw AppError.notFound('Order not found');
  return order;
}


/**
 * Attach any advance payments taken against this order to its freshly-raised bill,
 * and roll the bill's paid/outstanding figures forward.
 *
 * An outlet may pay before its order is fulfilled, at which point no bill exists —
 * the money is recorded against the order instead (Payment.orderId, billId null).
 * Fulfil raises the bill, so this is where that money finally lands on it, and why
 * a prepaid order never shows up under Pending Payment.
 */
async function applyAdvancesToBillTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  bill: { id: string; grandTotal: Prisma.Decimal },
) {
  const advances = await tx.payment.findMany({
    where: { orderId, billId: null, isDeleted: false, status: PaymentStatus.SUCCESS },
    select: { id: true, amount: true },
  });
  if (advances.length === 0) return;

  await tx.payment.updateMany({ where: { id: { in: advances.map((a) => a.id) } }, data: { billId: bill.id } });

  const paid = advances.reduce((sum, a) => sum.add(new Prisma.Decimal(a.amount)), new Prisma.Decimal(0));
  const balance = new Prisma.Decimal(bill.grandTotal).sub(paid);
  await tx.bill.update({
    where: { id: bill.id },
    data: {
      amountPaid: paid,
      // Never go negative: an overpayment leaves the bill settled, and the surplus
      // stays visible as payments exceeding the bill total rather than a bogus credit.
      balanceDue: balance.lessThan(0) ? new Prisma.Decimal(0) : balance,
      status: balance.lessThanOrEqualTo(0) ? BillStatus.PAID : BillStatus.PARTIALLY_PAID,
    },
  });
}

/** The outlet's outstanding bill for this order, if it has been fulfilled and still owes. */
async function outstandingBillFor(orderId: string) {
  return prisma.bill.findFirst({
    where: { orderId, isDeleted: false, status: { in: [BillStatus.UNPAID, BillStatus.PARTIALLY_PAID] } },
    select: { id: true, billNumber: true, grandTotal: true, amountPaid: true, balanceDue: true },
  });
}

/**
 * What this order still needs paying, and where that money should attach.
 *
 * Before Fulfil there is no bill, so the whole order total is payable as an advance.
 * After Fulfil the bill is the source of truth, so only its remaining balance is.
 */
async function payableFor(order: OrderWithItems): Promise<{ amount: Prisma.Decimal; billId: string | null }> {
  if (order.status === OutletOrderStatus.CONFIRMED) {
    const alreadyAdvanced = await prisma.payment.aggregate({
      where: { orderId: order.id, billId: null, isDeleted: false, status: PaymentStatus.SUCCESS },
      _sum: { amount: true },
    });
    const paid = new Prisma.Decimal(alreadyAdvanced._sum.amount ?? 0);
    return { amount: orderTotals(order).grandTotal.sub(paid), billId: null };
  }
  const bill = await outstandingBillFor(order.id);
  if (!bill) return { amount: new Prisma.Decimal(0), billId: null };
  return { amount: new Prisma.Decimal(bill.balanceDue), billId: bill.id };
}

/**
 * Start (or retry) an online checkout for an order.
 *
 * Allowed both before fulfilment (paying up front) and after it while the bill is
 * still outstanding — the outlet chooses when to settle.
 */
export async function createOrderPaymentIntent(user: AuthUser, id: string) {
  const order = await loadForTransition(id);
  assertOwnOutlet(user, order.outletId);
  if (order.status === OutletOrderStatus.CANCELLED) throw AppError.invalidState('This order was cancelled');

  const { amount } = await payableFor(order);
  const amountPaise = Math.round(Number(amount) * 100);
  if (amountPaise <= 0) throw AppError.invalidState('This order is already fully paid');

  try {
    const rzpOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: order.orderNumber,
      // orderId lets the webhook record the payment even if the browser dies mid-checkout.
      notes: { orderId: order.id, outletId: order.outletId },
    });
    await prisma.outletOrder.update({
      where: { id },
      data: { razorpayOrderId: rzpOrder.id, paymentMode: OrderPaymentMode.ONLINE },
    });
    return { orderId: rzpOrder.id, amount: amountPaise, currency: 'INR', keyId: env.RAZORPAY_KEY_ID };
  } catch (err) {
    throw AppError.payment(`Could not initiate payment: ${razorpayErrorMessage(err)}`);
  }
}

/**
 * Record a verified online payment for an order.
 *
 * Where the money lands depends on how far the order has got: against the bill if
 * it has been fulfilled, otherwise held against the order as an advance that Fulfil
 * will apply. Either way the order's own status is untouched — paying no longer
 * gates anything.
 */
async function recordOrderPaymentTx(
  tx: Prisma.TransactionClient,
  order: OrderWithItems,
  userId: string | null,
  amount: Prisma.Decimal,
  billId: string | null,
  paidWith: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
) {
  const paymentNumber = await nextDocNumber(tx, 'PAYMENT');
  await tx.payment.create({
    data: {
      paymentNumber,
      billId,
      orderId: order.id,
      outletId: order.outletId,
      channel: PaymentChannel.DIGITAL,
      method: PaymentMethod.RAZORPAY,
      amount,
      status: PaymentStatus.SUCCESS,
      createdById: userId,
      razorpayOrderId: paidWith.razorpayOrderId,
      razorpayPaymentId: paidWith.razorpayPaymentId,
      razorpaySignature: paidWith.razorpaySignature,
      notes: billId
        ? `Online payment for order ${order.orderNumber}`
        : `Advance online payment for order ${order.orderNumber} (before fulfilment)`,
    },
  });

  if (billId) {
    const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId }, select: { grandTotal: true, amountPaid: true } });
    const paid = new Prisma.Decimal(bill.amountPaid).add(amount);
    const balance = new Prisma.Decimal(bill.grandTotal).sub(paid);
    await tx.bill.update({
      where: { id: billId },
      data: {
        amountPaid: paid,
        balanceDue: balance.lessThan(0) ? new Prisma.Decimal(0) : balance,
        status: balance.lessThanOrEqualTo(0) ? BillStatus.PAID : BillStatus.PARTIALLY_PAID,
      },
    });
  }
}

/** Verify the Razorpay checkout signature and bank the payment. */
export async function verifyOrderPayment(user: AuthUser, id: string, input: VerifyOrderPaymentInput) {
  const order = await loadForTransition(id);
  assertOwnOutlet(user, order.outletId);

  const valid = verifyCheckoutSignature({
    orderId: input.razorpayOrderId,
    paymentId: input.razorpayPaymentId,
    signature: input.razorpaySignature,
  });
  if (!valid) throw AppError.payment('Payment signature verification failed');

  // The signature proves the payment is authentic; this proves it belongs to THIS order.
  if (order.razorpayOrderId !== input.razorpayOrderId) {
    throw AppError.payment('This payment does not belong to this order');
  }

  // Idempotency: the webhook may have banked it first, or the user double-submitted.
  const already = await prisma.payment.findFirst({ where: { razorpayPaymentId: input.razorpayPaymentId } });
  if (already) return { ...order, totals: numericTotals(order) };

  const { amount, billId } = await payableFor(order);
  if (Number(amount) <= 0) return { ...order, totals: numericTotals(order) };

  await prisma.$transaction((tx) =>
    recordOrderPaymentTx(tx, order, user.id, amount, billId, {
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      razorpaySignature: input.razorpaySignature,
    }),
  );

  const updated = await loadForTransition(id);
  cache.invalidateTags(CacheTag.ORDERS, CacheTag.BILLS, CacheTag.PAYMENTS, CacheTag.DASHBOARD, CacheTag.outlet(order.outletId));
  await emitRealtime(
    RealtimeEvent.ORDER_STATUS_CHANGED,
    { orderId: id, orderNumber: order.orderNumber, status: updated.status, outletName: order.outlet.name, paid: true },
    { global: true, outletId: order.outletId },
  );
  return { ...updated, totals: numericTotals(updated) };
}

/**
 * Bank an online order payment straight from the Razorpay webhook — the safety net
 * for when the payment succeeds but the browser never comes back to verify it.
 * Called by the payments webhook handler; there is no authenticated user here.
 */
export async function confirmPaidOrderFromWebhook(
  orderId: string,
  paidWith: { razorpayOrderId: string; razorpayPaymentId: string },
) {
  const order = await prisma.outletOrder.findFirst({ where: { id: orderId, isDeleted: false }, include: orderInclude });
  if (!order || order.status === OutletOrderStatus.CANCELLED) return { ignored: true };
  if (order.razorpayOrderId !== paidWith.razorpayOrderId) return { ignored: true };

  const already = await prisma.payment.findFirst({ where: { razorpayPaymentId: paidWith.razorpayPaymentId } });
  if (already) return { ignored: true };

  const { amount, billId } = await payableFor(order);
  if (Number(amount) <= 0) return { ignored: true };

  await prisma.$transaction((tx) =>
    recordOrderPaymentTx(tx, order, order.createdById ?? null, amount, billId, {
      razorpayOrderId: paidWith.razorpayOrderId,
      razorpayPaymentId: paidWith.razorpayPaymentId,
      razorpaySignature: 'webhook',
    }),
  );

  cache.invalidateTags(CacheTag.ORDERS, CacheTag.BILLS, CacheTag.PAYMENTS, CacheTag.DASHBOARD, CacheTag.outlet(order.outletId));
  await emitRealtime(
    RealtimeEvent.ORDER_STATUS_CHANGED,
    { orderId, orderNumber: order.orderNumber, status: order.status, outletName: order.outlet.name, paid: true },
    { global: true, outletId: order.outletId },
  );
  return { confirmed: true };
}

/**
 * Fulfil an order: the single action that sends it out and completes delivery.
 *
 * Replaces the old dispatch-then-outlet-confirms-receipt pair. Stock leaves the
 * godown and lands at the outlet in one transaction, the bill is raised (this is
 * the point the outlet genuinely owes money), and any advance already paid is
 * applied to it. What remains outstanding is what Pending Payment tracks.
 */
export async function fulfilOrder(user: AuthUser, id: string) {
  const order = await loadForTransition(id);
  if (order.status !== OutletOrderStatus.CONFIRMED) {
    throw AppError.invalidState('Only an order awaiting fulfilment can be fulfilled');
  }

  const model = sourceStockModel(FulfillmentSource.GODOWN);

  const { updated, bill, isNewBill } = await prisma.$transaction(async (tx) => {
    // Check every line before moving anything, so a shortfall can't leave the
    // order half-fulfilled.
    for (const item of order.items) {
      const qty = new Prisma.Decimal(item.confirmedQuantity ?? item.requestedQuantity);
      const stock = await model.find(tx, item.productId);
      if (!stock || new Prisma.Decimal(stock.quantity).lessThan(qty)) {
        throw AppError.insufficientStock(
          `Not enough ${model.label} stock for ${item.product.name}: need ${qty}, have ${stock?.quantity ?? 0}`,
        );
      }
    }

    for (const item of order.items) {
      const qty = new Prisma.Decimal(item.confirmedQuantity ?? item.requestedQuantity);
      await model.dec(tx, item.productId, qty);
      await tx.outletStock.upsert({
        where: { outletId_productId: { outletId: order.outletId, productId: item.productId } },
        create: { outletId: order.outletId, productId: item.productId, quantity: qty },
        update: { quantity: { increment: qty } },
      });
    }

    // A handful of orders were already CONFIRMED — with a bill already raised under
    // the old approve/pay-first flow — at the moment this workflow was simplified.
    // Fulfilling one of those must not raise a second bill; reuse the one it already has.
    const isNewBill = !order.bill;
    const raised: { id: string; billNumber: string; grandTotal: Prisma.Decimal } = order.bill
      ?? await (async () => {
        const fullOrder = await tx.outletOrder.findUniqueOrThrow({
          where: { id },
          include: { items: { include: { product: true } }, outlet: true },
        });
        return billingService.createBillForOrderTx(tx, fullOrder, user.id);
      })();
    await applyAdvancesToBillTx(tx, id, raised);

    const now = new Date();
    const row = await tx.outletOrder.update({
      where: { id },
      data: {
        status: OutletOrderStatus.DELIVERED,
        // Goods leaving and arriving are the same event now; both stamps are kept
        // so historical orders and new ones read consistently.
        dispatchedAt: now,
        deliveredAt: now,
        fulfillmentSource: FulfillmentSource.GODOWN,
      },
      include: orderInclude,
    });
    return { updated: row, bill: raised, isNewBill };
  });

  cache.invalidateTags(
    CacheTag.ORDERS, CacheTag.INVENTORY, CacheTag.BILLS, CacheTag.PAYMENTS,
    CacheTag.DASHBOARD, CacheTag.outlet(order.outletId),
  );
  // Only a genuinely new bill needs its PDF generated / a "bill generated" notice —
  // a reused legacy bill already went through this when it was first raised.
  if (isNewBill) await billingService.afterBillGenerated({ ...bill, outletId: order.outletId });
  await emitRealtime(
    RealtimeEvent.ORDER_RECEIVED,
    {
      orderId: id,
      orderNumber: order.orderNumber,
      status: updated.status,
      outletName: order.outlet.name,
      receivedAt: updated.deliveredAt,
    },
    { global: true, outletId: order.outletId },
  );
  return { ...updated, totals: numericTotals(updated) };
}

/**
 * Call off an order before it ships. Whoever works the fulfilment queue (main owner
 * or godown) can do this; the outlet that placed it cannot withdraw it themselves.
 *
 * Deliberately limited to unfulfilled orders: once Fulfil has run, stock has moved
 * and a bill exists, so undoing it is a credit note rather than a status flip.
 */
export async function cancelOrder(user: AuthUser, id: string, input: RejectOrderInput) {
  const order = await loadForTransition(id);
  if (order.status !== OutletOrderStatus.CONFIRMED) {
    throw AppError.invalidState('Only an order awaiting fulfilment can be cancelled');
  }
  // A small population of orders were already CONFIRMED — with a bill already raised
  // under the old approve/pay-first flow — at the moment this workflow was simplified.
  // Cancelling one of those is a credit note, not a status flip: there is no bill-void
  // path yet, so refuse rather than leave a real unpaid bill orphaned against a
  // cancelled order.
  if (order.bill) {
    throw AppError.invalidState(
      `${order.orderNumber} already has bill ${order.bill.billNumber} raised against it and cannot be cancelled here. Handle it via Billing instead.`,
    );
  }

  const updated = await prisma.outletOrder.update({
    where: { id },
    data: {
      status: OutletOrderStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledById: user.id,
      cancellationReason: input.reason,
    },
    include: orderInclude,
  });

  cache.invalidateTags(CacheTag.ORDERS, CacheTag.DASHBOARD, CacheTag.outlet(order.outletId));
  await emitRealtime(
    RealtimeEvent.ORDER_STATUS_CHANGED,
    { orderId: id, orderNumber: order.orderNumber, status: updated.status, outletName: order.outlet.name, reason: input.reason ?? null },
    { global: true, outletId: order.outletId },
  );
  return { ...updated, totals: numericTotals(updated) };
}

export const ordersService = {
  createOrder, listOrders, getOrder,
  createOrderPaymentIntent, verifyOrderPayment, confirmPaidOrderFromWebhook,
  fulfilOrder, cancelOrder,
};
