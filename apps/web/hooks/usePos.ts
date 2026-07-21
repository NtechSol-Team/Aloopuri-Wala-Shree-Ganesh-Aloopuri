'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export interface PosProduct {
  id: string;
  name: string;
  sku: string;
  unit: string;
  mrp: string;
  taxPercent: string;
  photoUrl: string | null;
  stock: number | null;
  trackInventory: boolean;
  popular: boolean;
  /** Units sold at this location in the last 30 days — drives the ★ Popular row. */
  soldCount: number;
  /** Manual grid position (lower = earlier); set by dragging cards. */
  displayOrder: number;
  category: { id: string; name: string };
}

export interface PosSession {
  id: string;
  sessionNumber: string;
  outletId: string | null;
  status: 'OPEN' | 'CLOSED';
  openingCash: string;
  openedAt: string;
}

export type KotStatus = 'PREPARING' | 'READY' | 'DELIVERED';
export type PosOrderType = 'DINE_IN' | 'PARCEL';

export interface PosTxnItem { menuItemId: string; quantity: number; discount: number }

export interface PosTxnItemDetail {
  id: string;
  productNameSnapshot: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxAmount: string;
  lineTotal: string;
}

export interface PosTxn {
  id: string;
  receiptNumber: string;
  tokenNumber: number | null;
  status: 'COMPLETED' | 'VOID' | 'HELD';
  kotStatus: KotStatus;
  orderType: PosOrderType;
  customerName: string | null;
  customerPhone: string | null;
  subTotal: string;
  itemDiscount: string;
  billDiscount: string;
  taxTotal: string;
  grandTotal: string;
  paymentMode: 'CASH' | 'CARD' | 'UPI' | 'SPLIT';
  cashReceived: string | null;
  changeGiven: string | null;
  cashAmount: string;
  cardAmount: string;
  upiAmount: string;
  voidReason: string | null;
  soldAt: string;
  items: PosTxnItemDetail[];
}

export interface CreateTxnPayload {
  sessionId: string;
  clientUuid?: string;
  orderType?: PosOrderType;
  customerName?: string;
  customerPhone?: string;
  billDiscount: number;
  paymentMode: 'CASH' | 'CARD' | 'UPI' | 'SPLIT';
  cashReceived?: number;
  split?: { cash: number; card: number; upi: number };
  soldAt?: string;
  items: PosTxnItem[];
}

export interface SessionSummary {
  sessionNumber: string;
  status: string;
  totalSales: number;
  cashCollected: number;
  cardCollected: number;
  upiCollected: number;
  transactionCount: number;
  voidCount: number;
  openingCash: number;
  todaySales: number;
  todayTransactionCount: number;
}

export interface KitchenTicket {
  id: string;
  tokenNumber: number | null;
  kotStatus: KotStatus;
  orderType: PosOrderType;
  soldAt: string;
  customerName: string | null;
  items: Array<{ productNameSnapshot: string; quantity: string }>;
}

export function usePosProducts() {
  return useQuery({ queryKey: ['pos', 'products'], queryFn: async () => (await api.get<ApiSuccess<PosProduct[]>>('/pos/products')).data.data });
}

/** Persist a dragged grid order. Optimistically re-sorts the cached grid so the
 *  move sticks instantly; reverts if the save fails. */
export function useReorderPosProducts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: Array<{ id: string; displayOrder: number }>) =>
      (await api.patch('/pos/products/order', { items })).data,
    onMutate: async (items) => {
      await qc.cancelQueries({ queryKey: ['pos', 'products'] });
      const prev = qc.getQueryData<PosProduct[]>(['pos', 'products']);
      if (prev) {
        const orderById = new Map(items.map((i) => [i.id, i.displayOrder]));
        const next = prev
          .map((p) => (orderById.has(p.id) ? { ...p, displayOrder: orderById.get(p.id)! } : p))
          .sort((a, b) => a.displayOrder - b.displayOrder || a.sku.localeCompare(b.sku, undefined, { numeric: true }));
        qc.setQueryData(['pos', 'products'], next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['pos', 'products'], ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: ['pos', 'products'] }),
  });
}

export function useCurrentSession() {
  return useQuery({ queryKey: ['pos', 'session'], queryFn: async () => (await api.get<ApiSuccess<PosSession | null>>('/pos/sessions/current')).data.data });
}

export function useOpenSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (openingCash: number) => (await api.post<ApiSuccess<PosSession>>('/pos/sessions', { openingCash })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos', 'session'] }),
  });
}

export function useCloseSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, closingCash }: { id: string; closingCash: number }) => (await api.post(`/pos/sessions/${id}/close`, { closingCash })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos'] }),
  });
}

export function useSessionSummary(id: string | null) {
  return useQuery({
    queryKey: ['pos', 'summary', id],
    enabled: !!id,
    queryFn: async () => (await api.get<ApiSuccess<SessionSummary>>(`/pos/sessions/${id}/summary`)).data.data,
  });
}

export function useCreateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateTxnPayload) => (await api.post<ApiSuccess<PosTxn>>('/pos/transactions', payload)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'products'] });
      qc.invalidateQueries({ queryKey: ['pos', 'summary'] });
      qc.invalidateQueries({ queryKey: ['pos', 'txns'] });
      qc.invalidateQueries({ queryKey: ['pos', 'kitchen'] });
    },
  });
}

export function useSessionTransactions(sessionId: string | null) {
  return useQuery({
    queryKey: ['pos', 'txns', sessionId],
    enabled: !!sessionId,
    queryFn: async () => (await api.get<ApiSuccess<PosTxn[]>>('/pos/transactions', { params: { sessionId } })).data.data,
  });
}

export function useVoidTransaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => (await api.post(`/pos/transactions/${id}/void`, { reason })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos'] }),
  });
}

export function useKitchenQueue() {
  return useQuery({
    queryKey: ['pos', 'kitchen'],
    queryFn: async () => (await api.get<ApiSuccess<KitchenTicket[]>>('/pos/kitchen')).data.data,
    refetchInterval: 15_000, // realtime socket is primary; this is the safety net
  });
}

export function useUpdateKot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'READY' | 'DELIVERED' }) => (await api.patch(`/pos/transactions/${id}/kot`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pos', 'kitchen'] }),
  });
}
