import {
  Prisma, BillStatus, FulfillmentSource, OrderPaymentMode, OutletOrderStatus,
  PaymentChannel, PaymentMethod, PaymentStatus, UserRole,
} from '@prisma/client';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import { nextDocNumber } from '../../shared/utils/docNumber';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import { emitRealtime } from '../../sockets/realtime';
import { RealtimeEvent } from '../../sockets/events';
import { razorpay, verifyCheckoutSignature } from '../../config/razorpay';
import { env } from '../../config/env';
import { billingService } from '../billing/billing.service';
import type { AuthUser } from '../../shared/types/api';
import type {
  ApproveOrderInput, CreateOrderInput, DispatchOrderInput, ListOrdersQuery,
  RejectOrderInput, VerifyOrderPaymentInput,
} from './orders.schema';

const orderInclude = {
  items: { include: { product: { select: { id: true, name: true, unit: true, basePrice: true, taxPercent: true } } } },
  outlet: { select: { id: true, name: true, pricingMode: true, gstBilling: true, creditPeriodDays: true } },
  bill: { select: { id: true, billNumber: true, grandTotal: true, status: true, isGstBill: true, balanceDue: true } },
} satisfies Prisma.OutletOrderInclude;

type OrderWithItems = Prisma.OutletOrderGetPayload<{ include: typeof orderInclude }>;

/**
 * Statuses in which an outlet already has an order in flight. While any of these
 * exist, the outlet cannot place another one — they must receive the current
 * order first (or cancel it, if it hasn't been confirmed yet).
 */
export const ACTIVE_ORDER_STATUSES = [
  OutletOrderStatus.PAYMENT_PENDING,
  OutletOrderStatus.CREDIT_APPROVAL_PENDING,
  OutletOrderStatus.CONFIRMED,
  OutletOrderStatus.DISPATCHED,
] as const;

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
    const rate = new Prisma.Decimal(item.unitPriceSnapshot ?? item.product.basePrice);
    const lineBase = rate.mul(qty);
    const taxPercent = order.isGstBill ? new Prisma.Decimal(item.product.taxPercent) : new Prisma.Decimal(0);
    subTotal = subTotal.add(lineBase);
    taxTotal = taxTotal.add(lineBase.mul(taxPercent).div(100));
  }
  return { subTotal, taxTotal, grandTotal: subTotal.add(taxTotal) };
}

/**
 * Place an order. Unlike before, the order is NOT confirmed here: it lands in
 * PAYMENT_PENDING and the outlet then either pays online or requests credit.
 *
 * Because the outlet pays before anyone reviews the order, prices have to be
 * resolved now — using the same fallback chain the confirmation step used to
 * apply (outlet special price → catalog base price) — and GST comes from the
 * outlet's billing preference.
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
      `You already have an active order (${blocking.orderNumber}). Please receive your current order before placing a new one.`,
    );
  }

  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, isDeleted: false, isActive: true, isPosEnabled: false },
    select: { id: true, basePrice: true },
  });
  if (products.length !== new Set(productIds).size) throw AppError.badRequest('One or more products are invalid');
  const priceOf = new Map(products.map((p) => [p.id, p.basePrice]));

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
        status: OutletOrderStatus.PAYMENT_PENDING,
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
  return { ...order, totals: numericTotals(order) };
}

export async function listOrders(user: AuthUser, query: ListOrdersQuery) {
  const scoped = user.role === UserRole.FRANCHISE_OWNER || user.role === UserRole.CASHIER;
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
 * Generate the order's bill and flip it to CONFIRMED, inside one transaction.
 * Shared by both confirmation routes (online payment verified / credit approved).
 * When `paidWith` is present the bill is settled immediately by an inserted
 * payment row — that is how an online-paid order arrives already PAID.
 */
async function confirmWithBillTx(
  tx: Prisma.TransactionClient,
  id: string,
  userId: string,
  paidWith?: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
) {
  const fullOrder = await tx.outletOrder.findUniqueOrThrow({
    where: { id },
    include: { items: { include: { product: true } }, outlet: true },
  });
  const bill = await billingService.createBillForOrderTx(tx, fullOrder, userId);

  if (paidWith) {
    const paymentNumber = await nextDocNumber(tx, 'PAYMENT');
    await tx.payment.create({
      data: {
        paymentNumber,
        billId: bill.id,
        outletId: bill.outletId,
        channel: PaymentChannel.DIGITAL,
        method: PaymentMethod.RAZORPAY,
        amount: bill.grandTotal,
        status: PaymentStatus.SUCCESS,
        createdById: userId,
        razorpayOrderId: paidWith.razorpayOrderId,
        razorpayPaymentId: paidWith.razorpayPaymentId,
        razorpaySignature: paidWith.razorpaySignature,
        notes: `Online payment for order ${fullOrder.orderNumber}`,
      },
    });
    await tx.bill.update({
      where: { id: bill.id },
      data: { amountPaid: bill.grandTotal, balanceDue: 0, status: BillStatus.PAID },
    });
  }

  const order = await tx.outletOrder.update({
    where: { id },
    data: { status: OutletOrderStatus.CONFIRMED, confirmedAt: new Date() },
    include: orderInclude,
  });
  return { order, bill };
}

/** The outlet chooses to settle this order on credit → main owner must approve it. */
export async function requestCredit(user: AuthUser, id: string) {
  const order = await loadForTransition(id);
  assertOwnOutlet(user, order.outletId);
  if (order.status !== OutletOrderStatus.PAYMENT_PENDING) {
    throw AppError.invalidState('Only an unpaid, unconfirmed order can be sent for credit approval');
  }

  const updated = await prisma.outletOrder.update({
    where: { id },
    data: { status: OutletOrderStatus.CREDIT_APPROVAL_PENDING, paymentMode: OrderPaymentMode.CREDIT },
    include: orderInclude,
  });

  cache.invalidateTags(CacheTag.ORDERS, CacheTag.DASHBOARD, CacheTag.outlet(order.outletId));
  await emitRealtime(
    RealtimeEvent.ORDER_CREDIT_REQUESTED,
    {
      orderId: id,
      orderNumber: order.orderNumber,
      outletName: order.outlet.name,
      amount: Number(orderTotals(order).grandTotal),
    },
    { global: true, outletId: order.outletId },
  );
  return { ...updated, totals: numericTotals(updated) };
}

/** Start (or retry) an online checkout: a Razorpay order for exactly what the bill will total. */
export async function createOrderPaymentIntent(user: AuthUser, id: string) {
  const order = await loadForTransition(id);
  assertOwnOutlet(user, order.outletId);
  if (order.status !== OutletOrderStatus.PAYMENT_PENDING) {
    throw AppError.invalidState('This order is not awaiting payment');
  }

  const { grandTotal } = orderTotals(order);
  const amountPaise = Math.round(Number(grandTotal) * 100);
  if (amountPaise <= 0) throw AppError.badRequest('Order total must be greater than zero');

  try {
    const rzpOrder = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: order.orderNumber,
      // orderId lets the webhook confirm the order even if the browser dies mid-payment.
      notes: { orderId: order.id, outletId: order.outletId },
    });
    await prisma.outletOrder.update({
      where: { id },
      data: { razorpayOrderId: rzpOrder.id, paymentMode: OrderPaymentMode.ONLINE },
    });
    return { orderId: rzpOrder.id, amount: amountPaise, currency: 'INR', keyId: env.RAZORPAY_KEY_ID };
  } catch (err) {
    throw AppError.payment(`Could not initiate payment: ${(err as Error).message}`);
  }
}

/**
 * Verify the Razorpay checkout signature and confirm the order. A failed, cancelled
 * or abandoned payment simply never reaches here: the order stays PAYMENT_PENDING
 * and the outlet can retry.
 */
export async function verifyOrderPayment(user: AuthUser, id: string, input: VerifyOrderPaymentInput) {
  const order = await loadForTransition(id);
  assertOwnOutlet(user, order.outletId);

  const valid = verifyCheckoutSignature({
    orderId: input.razorpayOrderId,
    paymentId: input.razorpayPaymentId,
    signature: input.razorpaySignature,
  });
  if (!valid) throw AppError.payment('Payment signature verification failed');

  // The signature only proves the payment is authentic — this proves it belongs to THIS order.
  if (order.razorpayOrderId !== input.razorpayOrderId) {
    throw AppError.payment('This payment does not belong to this order');
  }

  // Idempotency: the webhook may have confirmed it first (or the user double-submitted).
  if (order.status !== OutletOrderStatus.PAYMENT_PENDING) {
    if (order.status === OutletOrderStatus.CONFIRMED) return { ...order, totals: numericTotals(order) };
    throw AppError.invalidState('This order is no longer awaiting payment');
  }
  const already = await prisma.payment.findFirst({ where: { razorpayPaymentId: input.razorpayPaymentId } });
  if (already) return { ...order, totals: numericTotals(order) };

  const { order: confirmed, bill } = await prisma.$transaction((tx) =>
    confirmWithBillTx(tx, id, user.id, {
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      razorpaySignature: input.razorpaySignature,
    }),
  );

  cache.invalidateTags(CacheTag.ORDERS, CacheTag.BILLS, CacheTag.PAYMENTS, CacheTag.DASHBOARD, CacheTag.outlet(order.outletId));
  await billingService.afterBillGenerated(bill);
  await emitRealtime(
    RealtimeEvent.ORDER_STATUS_CHANGED,
    { orderId: id, orderNumber: confirmed.orderNumber, status: confirmed.status, outletName: order.outlet.name, paid: true },
    { global: true, outletId: order.outletId },
  );
  return { ...confirmed, totals: numericTotals(confirmed) };
}

/**
 * Confirm an online order straight from the Razorpay webhook — the safety net for
 * when the payment succeeds but the browser never comes back to verify it.
 * Called by the payments webhook handler; there is no authenticated user here.
 */
export async function confirmPaidOrderFromWebhook(
  orderId: string,
  paidWith: { razorpayOrderId: string; razorpayPaymentId: string },
) {
  const order = await prisma.outletOrder.findFirst({ where: { id: orderId, isDeleted: false }, include: orderInclude });
  if (!order || order.status !== OutletOrderStatus.PAYMENT_PENDING) return { ignored: true };
  if (order.razorpayOrderId !== paidWith.razorpayOrderId) return { ignored: true };

  const { order: confirmed, bill } = await prisma.$transaction((tx) =>
    confirmWithBillTx(tx, orderId, order.createdById ?? '', {
      razorpayOrderId: paidWith.razorpayOrderId,
      razorpayPaymentId: paidWith.razorpayPaymentId,
      razorpaySignature: 'webhook',
    }),
  );

  cache.invalidateTags(CacheTag.ORDERS, CacheTag.BILLS, CacheTag.PAYMENTS, CacheTag.DASHBOARD, CacheTag.outlet(order.outletId));
  await billingService.afterBillGenerated(bill);
  await emitRealtime(
    RealtimeEvent.ORDER_STATUS_CHANGED,
    { orderId, orderNumber: confirmed.orderNumber, status: confirmed.status, outletName: order.outlet.name, paid: true },
    { global: true, outletId: order.outletId },
  );
  return { confirmed: true };
}

/**
 * Main owner approves a credit order → CONFIRMED, with the bill raised on credit
 * (unpaid, due per the outlet's credit period). Quantities, prices and the GST
 * flag can still be adjusted here — this is the last point before money is owed.
 */
export async function approveOrder(user: AuthUser, id: string, input: ApproveOrderInput) {
  const order = await loadForTransition(id);
  if (order.status !== OutletOrderStatus.CREDIT_APPROVAL_PENDING) {
    throw AppError.invalidState('Only orders awaiting credit approval can be approved');
  }

  const overrides = new Map((input.items ?? []).map((i) => [i.itemId, i]));

  const { order: confirmed, bill } = await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      const override = overrides.get(item.id);
      if (!override) continue;
      await tx.outletOrderItem.update({
        where: { id: item.id },
        data: {
          confirmedQuantity: override.confirmedQuantity,
          ...(override.unitPrice != null ? { unitPriceSnapshot: override.unitPrice } : {}),
        },
      });
    }
    await tx.outletOrder.update({
      where: { id },
      data: { isGstBill: input.isGstBill, approvedAt: new Date(), approvedById: user.id },
    });
    return confirmWithBillTx(tx, id, user.id);
  });

  cache.invalidateTags(CacheTag.ORDERS, CacheTag.BILLS, CacheTag.DASHBOARD, CacheTag.outlet(order.outletId));
  await billingService.afterBillGenerated(bill);
  await emitRealtime(
    RealtimeEvent.ORDER_STATUS_CHANGED,
    { orderId: id, orderNumber: confirmed.orderNumber, status: confirmed.status, outletName: order.outlet.name, approved: true },
    { global: true, outletId: order.outletId },
  );
  return { ...confirmed, totals: numericTotals(confirmed) };
}

/** Main owner rejects a credit order → CANCELLED, with an optional reason shown to the outlet. */
export async function rejectOrder(user: AuthUser, id: string, input: RejectOrderInput) {
  const order = await loadForTransition(id);
  if (order.status !== OutletOrderStatus.CREDIT_APPROVAL_PENDING) {
    throw AppError.invalidState('Only orders awaiting credit approval can be rejected');
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

/**
 * CONFIRMED → DISPATCHED. Stock leaves the chosen source here, when the goods
 * physically leave, and lands in the outlet only once they confirm receipt — so
 * a stock shortfall surfaces to the dispatcher (who can fix it) instead of to the
 * outlet at receipt time. The bill already exists (raised at confirmation).
 */
export async function dispatchOrder(_user: AuthUser, id: string, input: DispatchOrderInput) {
  const order = await loadForTransition(id);
  if (order.status !== OutletOrderStatus.CONFIRMED) throw AppError.invalidState('Only confirmed orders can be dispatched');

  const model = sourceStockModel(input.fulfillmentSource);

  const updated = await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      const qty = new Prisma.Decimal(item.confirmedQuantity ?? item.requestedQuantity);
      const stock = await model.find(tx, item.productId);
      if (!stock || new Prisma.Decimal(stock.quantity).lessThan(qty)) {
        throw AppError.insufficientStock(`Not enough ${model.label} stock for ${item.product.name}: need ${qty}, have ${stock?.quantity ?? 0}`);
      }
    }
    for (const item of order.items) {
      const qty = new Prisma.Decimal(item.confirmedQuantity ?? item.requestedQuantity);
      await model.dec(tx, item.productId, qty);
    }
    return tx.outletOrder.update({
      where: { id },
      data: { status: OutletOrderStatus.DISPATCHED, dispatchedAt: new Date(), fulfillmentSource: input.fulfillmentSource },
      include: orderInclude,
    });
  });

  cache.invalidateTags(CacheTag.ORDERS, CacheTag.INVENTORY, CacheTag.DASHBOARD, CacheTag.outlet(order.outletId));
  await emitRealtime(
    RealtimeEvent.ORDER_STATUS_CHANGED,
    { orderId: id, orderNumber: order.orderNumber, status: updated.status, outletName: order.outlet.name },
    { global: true, outletId: order.outletId },
  );
  return { ...updated, totals: numericTotals(updated) };
}

/**
 * DISPATCHED → DELIVERED, triggered by the outlet once the goods are physically
 * in hand. Stock (already out of the source since dispatch) lands in the outlet.
 */
export async function receiveOrder(user: AuthUser, id: string) {
  const order = await loadForTransition(id);
  assertOwnOutlet(user, order.outletId);
  if (order.status !== OutletOrderStatus.DISPATCHED) throw AppError.invalidState('Only dispatched orders can be received');

  const updated = await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      const qty = new Prisma.Decimal(item.confirmedQuantity ?? item.requestedQuantity);
      await tx.outletStock.upsert({
        where: { outletId_productId: { outletId: order.outletId, productId: item.productId } },
        create: { outletId: order.outletId, productId: item.productId, quantity: qty },
        update: { quantity: { increment: qty } },
      });
    }
    return tx.outletOrder.update({
      where: { id },
      data: { status: OutletOrderStatus.DELIVERED, deliveredAt: new Date() },
      include: orderInclude,
    });
  });

  cache.invalidateTags(CacheTag.ORDERS, CacheTag.INVENTORY, CacheTag.DASHBOARD, CacheTag.outlet(order.outletId));
  await emitRealtime(
    RealtimeEvent.ORDER_RECEIVED,
    { orderId: id, orderNumber: order.orderNumber, status: updated.status, outletName: order.outlet.name, receivedAt: updated.deliveredAt },
    { global: true, outletId: order.outletId },
  );
  return { ...updated, totals: numericTotals(updated) };
}

/**
 * The outlet backs out of an order they haven't settled yet. Deliberately limited
 * to the pre-confirmation states: once an order is CONFIRMED it has been paid for
 * or approved on credit and a bill exists, so cancelling would mean a refund/credit
 * note rather than a status flip.
 */
export async function cancelOrder(user: AuthUser, id: string, input: RejectOrderInput) {
  const order = await loadForTransition(id);
  assertOwnOutlet(user, order.outletId);
  if (order.status !== OutletOrderStatus.PAYMENT_PENDING && order.status !== OutletOrderStatus.CREDIT_APPROVAL_PENDING) {
    throw AppError.invalidState('Only orders awaiting payment or credit approval can be cancelled');
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
  requestCredit, createOrderPaymentIntent, verifyOrderPayment, confirmPaidOrderFromWebhook,
  approveOrder, rejectOrder,
  dispatchOrder, receiveOrder, cancelOrder,
};
