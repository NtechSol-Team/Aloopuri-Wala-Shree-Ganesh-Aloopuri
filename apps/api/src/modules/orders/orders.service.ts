import { Prisma, FulfillmentSource, OutletOrderStatus, UserRole } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import { nextDocNumber } from '../../shared/utils/docNumber';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import { emitRealtime } from '../../sockets/realtime';
import { RealtimeEvent } from '../../sockets/events';
import { billingService } from '../billing/billing.service';
import type { AuthUser } from '../../shared/types/api';
import type { ConfirmOrderInput, CreateOrderInput, ListOrdersQuery } from './orders.schema';

const orderInclude = {
  items: { include: { product: { select: { id: true, name: true, unit: true, basePrice: true } } } },
  outlet: { select: { id: true, name: true, pricingMode: true } },
  bill: { select: { id: true, billNumber: true, grandTotal: true, status: true, isGstBill: true } },
} satisfies Prisma.OutletOrderInclude;

/** Where confirmed stock is decremented from at delivery — set on the order at confirm time. */
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

export async function createOrder(user: AuthUser, input: CreateOrderInput) {
  const outletId = resolveOutletId(user, input.outletId);
  const productIds = input.items.map((i) => i.productId);
  const products = await prisma.product.findMany({ where: { id: { in: productIds }, isDeleted: false, isActive: true }, select: { id: true } });
  if (products.length !== new Set(productIds).size) throw AppError.badRequest('One or more products are invalid');

  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await nextDocNumber(tx, 'ORDER');
    return tx.outletOrder.create({
      data: {
        orderNumber,
        outletId,
        status: OutletOrderStatus.PENDING,
        notes: input.notes,
        createdById: user.id,
        items: { create: input.items.map((i) => ({ productId: i.productId, requestedQuantity: i.requestedQuantity })) },
      },
      include: orderInclude,
    });
  });

  cache.invalidateTags(CacheTag.ORDERS, CacheTag.DASHBOARD, CacheTag.outlet(outletId));
  await emitRealtime(
    RealtimeEvent.NEW_ORDER,
    { orderId: order.id, orderNumber: order.orderNumber, outletName: order.outlet.name },
    { global: true, outletId },
  );
  return order;
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
  return { rows, meta: buildPaginationMeta(query, total) };
}

export async function getOrder(user: AuthUser, id: string) {
  const scoped = user.role === UserRole.FRANCHISE_OWNER || user.role === UserRole.CASHIER;
  const order = await prisma.outletOrder.findFirst({
    where: { id, isDeleted: false, ...(scoped ? { outletId: user.outletId ?? '__none__' } : {}) },
    include: orderInclude,
  });
  if (!order) throw AppError.notFound('Order not found');
  return order;
}

async function loadForTransition(id: string) {
  const order = await prisma.outletOrder.findFirst({ where: { id, isDeleted: false }, include: orderInclude });
  if (!order) throw AppError.notFound('Order not found');
  return order;
}

/** PENDING → CONFIRMED, with optional partial quantities + a price override, and the fulfilment source (main branch or godown). */
export async function confirmOrder(_user: AuthUser, id: string, input: ConfirmOrderInput) {
  const order = await loadForTransition(id);
  if (order.status !== OutletOrderStatus.PENDING) throw AppError.invalidState('Only pending orders can be confirmed');

  const overrides = new Map((input.items ?? []).map((i) => [i.itemId, i]));

  // This outlet's negotiated prices (only consulted when it's on SPECIAL pricing) — used
  // as the default whenever the confirming admin doesn't type an explicit override.
  const specials = order.outlet.pricingMode === 'SPECIAL'
    ? await prisma.outletProductPrice.findMany({
        where: { outletId: order.outletId, productId: { in: order.items.map((i) => i.productId) } },
        select: { productId: true, price: true },
      })
    : [];
  const specialMap = new Map(specials.map((s) => [s.productId, s.price]));

  const updated = await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      const override = overrides.get(item.id);
      const confirmedQuantity = override ? override.confirmedQuantity : Number(item.requestedQuantity);
      const unitPriceSnapshot = override?.unitPrice ?? specialMap.get(item.productId) ?? item.product.basePrice;
      await tx.outletOrderItem.update({
        where: { id: item.id },
        data: { confirmedQuantity, unitPriceSnapshot },
      });
    }
    return tx.outletOrder.update({
      where: { id },
      data: { status: OutletOrderStatus.CONFIRMED, confirmedAt: new Date(), fulfillmentSource: input.fulfillmentSource, isGstBill: input.isGstBill },
      include: orderInclude,
    });
  });

  cache.invalidateTags(CacheTag.ORDERS, CacheTag.outlet(order.outletId));
  await emitRealtime(RealtimeEvent.ORDER_STATUS_CHANGED, { orderId: id, orderNumber: order.orderNumber, status: updated.status }, { global: true, outletId: order.outletId });
  return updated;
}

/** CONFIRMED → DISPATCHED, auto-generating the bill. */
export async function dispatchOrder(user: AuthUser, id: string) {
  const existing = await loadForTransition(id);
  if (existing.status !== OutletOrderStatus.CONFIRMED) throw AppError.invalidState('Only confirmed orders can be dispatched');
  if (existing.bill) throw AppError.conflict('A bill already exists for this order');

  const { order, bill } = await prisma.$transaction(async (tx) => {
    const fullOrder = await tx.outletOrder.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { product: true } }, outlet: true },
    });
    const createdBill = await billingService.createBillForOrderTx(tx, fullOrder, user.id);
    const updatedOrder = await tx.outletOrder.update({
      where: { id },
      data: { status: OutletOrderStatus.DISPATCHED, dispatchedAt: new Date() },
      include: orderInclude,
    });
    return { order: updatedOrder, bill: createdBill };
  });

  cache.invalidateTags(CacheTag.ORDERS, CacheTag.BILLS, CacheTag.DASHBOARD, CacheTag.outlet(order.outletId));
  await billingService.afterBillGenerated(bill);
  await emitRealtime(RealtimeEvent.ORDER_STATUS_CHANGED, { orderId: id, orderNumber: order.orderNumber, status: order.status }, { global: true, outletId: order.outletId });
  return order;
}

/** DISPATCHED → DELIVERED, moving stock from the confirmed fulfilment source → outlet. */
export async function deliverOrder(_user: AuthUser, id: string) {
  const order = await loadForTransition(id);
  if (order.status !== OutletOrderStatus.DISPATCHED) throw AppError.invalidState('Only dispatched orders can be delivered');

  // Orders confirmed before this field existed default to main-branch (the prior fixed behaviour).
  const model = sourceStockModel(order.fulfillmentSource ?? FulfillmentSource.MAIN_BRANCH);

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
      await tx.outletStock.upsert({
        where: { outletId_productId: { outletId: order.outletId, productId: item.productId } },
        create: { outletId: order.outletId, productId: item.productId, quantity: qty },
        update: { quantity: { increment: qty } },
      });
    }
    return tx.outletOrder.update({ where: { id }, data: { status: OutletOrderStatus.DELIVERED, deliveredAt: new Date() }, include: orderInclude });
  });

  cache.invalidateTags(CacheTag.ORDERS, CacheTag.INVENTORY, CacheTag.DASHBOARD, CacheTag.outlet(order.outletId));
  await emitRealtime(RealtimeEvent.ORDER_STATUS_CHANGED, { orderId: id, orderNumber: order.orderNumber, status: updated.status }, { global: true, outletId: order.outletId });
  return updated;
}

export async function cancelOrder(user: AuthUser, id: string) {
  const order = await loadForTransition(id);
  if (user.role !== UserRole.SUPER_ADMIN && order.outletId !== user.outletId) throw AppError.forbidden();
  if (order.status !== OutletOrderStatus.PENDING && order.status !== OutletOrderStatus.CONFIRMED) {
    throw AppError.invalidState('Only pending or confirmed orders can be cancelled');
  }
  const updated = await prisma.outletOrder.update({ where: { id }, data: { status: OutletOrderStatus.CANCELLED }, include: orderInclude });
  cache.invalidateTags(CacheTag.ORDERS, CacheTag.outlet(order.outletId));
  await emitRealtime(RealtimeEvent.ORDER_STATUS_CHANGED, { orderId: id, orderNumber: order.orderNumber, status: updated.status }, { global: true, outletId: order.outletId });
  return updated;
}

export const ordersService = { createOrder, listOrders, getOrder, confirmOrder, dispatchOrder, deliverOrder, cancelOrder };
