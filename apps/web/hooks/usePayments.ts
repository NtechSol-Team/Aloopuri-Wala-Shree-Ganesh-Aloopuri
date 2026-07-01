'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export interface PaymentSummary {
  totalReceivables: number;
  collectedThisMonth: number;
  overdueAmount: number;
  outletOutstanding: Array<{ outletId: string; outletName: string; outstanding: number }>;
  aging: Array<{ label: string; amount: number }>;
}

export interface PaymentRow {
  id: string;
  paymentNumber: string;
  amount: string;
  channel: string;
  method: string;
  paymentDate: string;
  bill: { billNumber: string } | null;
  outlet: { name: string };
}

export interface RazorpayOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  ['bills', 'payments', 'dashboard', 'payment-summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

export function usePaymentSummary() {
  return useQuery({
    queryKey: ['payment-summary'],
    queryFn: async () => (await api.get<ApiSuccess<PaymentSummary>>('/payments/summary')).data.data,
  });
}

export function usePayments(params: { outletId?: string } = {}) {
  return useQuery({
    queryKey: ['payments', params],
    queryFn: async () => (await api.get<ApiSuccess<PaymentRow[]>>('/payments', { params: { limit: 100, ...params } })).data.data,
  });
}

export function useRecordCash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { billId: string; amount: number; notes?: string }) =>
      (await api.post('/payments/cash', input)).data,
    onSuccess: () => invalidateAll(qc),
  });
}

export function useRazorpayOrder() {
  return useMutation({
    mutationFn: async (billId: string) => (await api.post<ApiSuccess<RazorpayOrder>>('/payments/razorpay/order', { billId })).data.data,
  });
}

export function useVerifyRazorpay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { billId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) =>
      (await api.post('/payments/razorpay/verify', input)).data,
    onSuccess: () => invalidateAll(qc),
  });
}
