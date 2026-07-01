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
  stock: number;
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

export interface PosTxnItem { productId: string; quantity: number; discount: number }
export interface CreateTxnPayload {
  sessionId: string;
  clientUuid?: string;
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
}

export function usePosProducts() {
  return useQuery({ queryKey: ['pos', 'products'], queryFn: async () => (await api.get<ApiSuccess<PosProduct[]>>('/pos/products')).data.data });
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
    mutationFn: async (payload: CreateTxnPayload) => (await api.post<ApiSuccess<{ receiptNumber: string; grandTotal: string; changeGiven: string | null }>>('/pos/transactions', payload)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pos', 'products'] });
      qc.invalidateQueries({ queryKey: ['pos', 'summary'] });
    },
  });
}
