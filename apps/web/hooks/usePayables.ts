'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export type SupplierBillStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';

export interface PayableBill {
  id: string;
  billNumber: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  billDate: string;
  dueDate: string | null;
  totalAmount: string;
  amountPaid: string;
  balanceDue: string;
  status: SupplierBillStatus;
}

export interface PayablesSummary {
  totalPayable: number;
  paidThisMonth: number;
  bySupplier: Array<{ supplierName: string; outstanding: number }>;
  aging: Array<{ label: string; amount: number }>;
}

export function usePayables(params: { status?: SupplierBillStatus; outstandingOnly?: boolean; search?: string } = {}) {
  return useQuery({
    queryKey: ['payables', params],
    queryFn: async () => (await api.get<ApiSuccess<PayableBill[]>>('/payables', { params: { limit: 100, ...params } })).data.data,
  });
}

export function usePayablesSummary() {
  return useQuery({ queryKey: ['payables', 'summary'], queryFn: async () => (await api.get<ApiSuccess<PayablesSummary>>('/payables/summary')).data.data });
}

export function usePaySupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; amount: number; method: string; notes?: string }) =>
      (await api.post(`/payables/${id}/pay`, body)).data,
    onSuccess: () => ['payables', 'production', 'accounting', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })),
  });
}
