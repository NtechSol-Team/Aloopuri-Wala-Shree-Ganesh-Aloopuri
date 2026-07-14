'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export type OrderStatus =
  | 'PAYMENT_PENDING'
  | 'CREDIT_APPROVAL_PENDING'
  | 'CONFIRMED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'CANCELLED';

export type FulfillmentSource = 'MAIN_BRANCH' | 'GODOWN';
export type OrderPaymentMode = 'ONLINE' | 'CREDIT';

/** Statuses that count as "in flight" — an outlet may only have one at a time. */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  'PAYMENT_PENDING', 'CREDIT_APPROVAL_PENDING', 'CONFIRMED', 'DISPATCHED',
];

/**
 * Human labels for the workflow. DISPATCHED reads as "Awaiting Receipt" because
 * that is what it means to both sides: the goods have left, and the order sits
 * there until the outlet confirms they physically arrived.
 */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PAYMENT_PENDING: 'Payment Pending',
  CREDIT_APPROVAL_PENDING: 'Credit Approval Pending',
  CONFIRMED: 'Confirmed',
  DISPATCHED: 'Awaiting Receipt',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const ORDER_STATUS_BADGE: Record<OrderStatus, 'warning' | 'info' | 'success' | 'danger' | 'neutral'> = {
  PAYMENT_PENDING: 'warning',
  CREDIT_APPROVAL_PENDING: 'warning',
  CONFIRMED: 'info',
  DISPATCHED: 'info',
  DELIVERED: 'success',
  CANCELLED: 'danger',
};

export interface OrderItem {
  id: string;
  requestedQuantity: string;
  confirmedQuantity: string | null;
  unitPriceSnapshot: string | null;
  product: { id: string; name: string; unit: string; basePrice: string; taxPercent: string };
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  orderDate: string;
  notes: string | null;
  paymentMode: OrderPaymentMode | null;
  fulfillmentSource: FulfillmentSource | null;
  isGstBill: boolean;
  confirmedAt: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  cancellationReason: string | null;
  items: OrderItem[];
  outlet: { id: string; name: string; pricingMode: 'GENERIC' | 'SPECIAL'; gstBilling: boolean; creditPeriodDays: number };
  bill: { id: string; billNumber: string; grandTotal: string; status: string; isGstBill: boolean; balanceDue: string } | null;
  /** What the outlet owes — computed server-side with the same maths as the bill. */
  totals: { subTotal: number; taxTotal: number; grandTotal: number };
}

export interface RazorpayOrderIntent { orderId: string; amount: number; currency: string; keyId: string }

export function useOrders(params: { status?: OrderStatus } = {}) {
  return useQuery({
    queryKey: ['orders', params],
    queryFn: async () => (await api.get<ApiSuccess<Order[]>>('/orders', { params: { limit: 100, ...params } })).data.data,
  });
}

/** Every order mutation ripples into the same downstream views — invalidate them together. */
function useOrderMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['bills'] });
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useCreateOrder() {
  return useOrderMutation(async (input: { items: Array<{ productId: string; requestedQuantity: number }>; notes?: string }) =>
    (await api.post<ApiSuccess<Order>>('/orders', input)).data.data,
  );
}

/** Outlet: settle this order on credit → goes to the main owner for approval. */
export function useRequestCredit() {
  return useOrderMutation(async (id: string) => (await api.post<ApiSuccess<Order>>(`/orders/${id}/credit`, {})).data.data);
}

/** Outlet: open (or retry) an online checkout for this order. */
export function useOrderPaymentIntent() {
  return useMutation({
    mutationFn: async (id: string) => (await api.post<ApiSuccess<RazorpayOrderIntent>>(`/orders/${id}/razorpay/order`, {})).data.data,
  });
}

export function useVerifyOrderPayment() {
  return useOrderMutation(async ({ id, ...body }: { id: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
    (await api.post<ApiSuccess<Order>>(`/orders/${id}/razorpay/verify`, body)).data.data,
  );
}

/** Main owner: approve a credit order (optionally trimming quantities / repricing). */
export function useApproveOrder() {
  return useOrderMutation(async ({ id, isGstBill, items }: {
    id: string;
    isGstBill: boolean;
    items?: Array<{ itemId: string; confirmedQuantity: number; unitPrice?: number }>;
  }) => (await api.post<ApiSuccess<Order>>(`/orders/${id}/approve`, { isGstBill, items })).data.data);
}

export function useRejectOrder() {
  return useOrderMutation(async ({ id, reason }: { id: string; reason?: string }) =>
    (await api.post<ApiSuccess<Order>>(`/orders/${id}/reject`, { reason })).data.data,
  );
}

export function useDispatchOrder() {
  return useOrderMutation(async ({ id, fulfillmentSource }: { id: string; fulfillmentSource: FulfillmentSource }) =>
    (await api.post<ApiSuccess<Order>>(`/orders/${id}/dispatch`, { fulfillmentSource })).data.data,
  );
}

/** Outlet: the goods physically arrived. */
export function useReceiveOrder() {
  return useOrderMutation(async (id: string) => (await api.post<ApiSuccess<Order>>(`/orders/${id}/receive`, {})).data.data);
}

export function useCancelOrder() {
  return useOrderMutation(async ({ id, reason }: { id: string; reason?: string }) =>
    (await api.post<ApiSuccess<Order>>(`/orders/${id}/cancel`, { reason })).data.data,
  );
}
