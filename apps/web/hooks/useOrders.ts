'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
export type FulfillmentSource = 'MAIN_BRANCH' | 'GODOWN';

export interface OrderItem {
  id: string;
  requestedQuantity: string;
  confirmedQuantity: string | null;
  unitPriceSnapshot: string | null;
  product: { id: string; name: string; unit: string; basePrice: string };
}
export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  orderDate: string;
  notes: string | null;
  fulfillmentSource: FulfillmentSource | null;
  items: OrderItem[];
  outlet: { id: string; name: string };
  bill: { id: string; billNumber: string; grandTotal: string; status: string } | null;
}

export function useOrders(params: { status?: OrderStatus } = {}) {
  return useQuery({
    queryKey: ['orders', params],
    queryFn: async () => (await api.get<ApiSuccess<Order[]>>('/orders', { params: { limit: 100, ...params } })).data.data,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { items: Array<{ productId: string; requestedQuantity: number }>; notes?: string }) =>
      (await api.post<ApiSuccess<Order>>('/orders', input)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useConfirmOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, fulfillmentSource, items }: {
      id: string;
      fulfillmentSource: FulfillmentSource;
      items: Array<{ itemId: string; confirmedQuantity: number; unitPrice?: number }>;
    }) => (await api.post<ApiSuccess<Order>>(`/orders/${id}/confirm`, { fulfillmentSource, items })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useOrderAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'confirm' | 'dispatch' | 'deliver' | 'cancel' }) =>
      (await api.post<ApiSuccess<Order>>(`/orders/${id}/${action}`, {})).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['bills'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
