'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_BASE } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export type BillStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED';

export interface BillListItem {
  id: string;
  billNumber: string;
  billDate: string;
  dueDate: string;
  grandTotal: string;
  amountPaid: string;
  balanceDue: string;
  status: BillStatus;
  pdfUrl: string | null;
  isOverdue: boolean;
  isGstBill: boolean;
  outlet: { id: string; name: string };
}

export interface BillDetail extends Omit<BillListItem, 'outlet'> {
  subTotal: string;
  taxTotal: string;
  outlet: { id: string; name: string; address: string | null; phone: string | null };
  items: Array<{ id: string; productNameSnapshot: string; quantity: string; rate: string; taxPercent: string; taxAmount: string; lineTotal: string }>;
  payments: Array<{ id: string; paymentNumber: string; amount: string; method: string; paymentDate: string }>;
}

export function useBills(params: { status?: BillStatus; overdueOnly?: boolean; sort?: string } = {}) {
  return useQuery({
    queryKey: ['bills', params],
    queryFn: async () => (await api.get<ApiSuccess<BillListItem[]>>('/billing', { params: { limit: 100, ...params } })).data.data,
  });
}

export function useBill(id: string | null) {
  return useQuery({
    queryKey: ['bills', 'detail', id],
    enabled: !!id,
    queryFn: async () => (await api.get<ApiSuccess<BillDetail>>(`/billing/${id}`)).data.data,
  });
}

export function useRegenerateBillPdf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post(`/billing/${id}/pdf`, {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bills'] }),
  });
}

/** Absolute URL to a bill PDF served by the API. */
export function billPdfHref(pdfUrl: string | null): string | null {
  if (!pdfUrl) return null;
  return `${API_BASE.replace('/api/v1', '')}${pdfUrl}`;
}
