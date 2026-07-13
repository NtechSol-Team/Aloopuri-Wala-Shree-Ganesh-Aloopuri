'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { printPdfBlob } from '@/lib/receipt-print';
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

/**
 * Fetches a bill PDF through the authenticated API (streamed fresh from the DB on
 * every call — see GET /billing/:id/pdf) and opens it in a new tab. Deliberately not
 * a plain <a href> to a static file: that requires the Authorization header, which a
 * bare anchor tag can't send, and a static file may not even exist on disk anymore
 * (Render's free-tier filesystem is ephemeral and gets wiped on every restart).
 */
export function useOpenBillPdf() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.get(`/billing/${id}/pdf`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
  });
}

/** Fetches the bill PDF the same way as useOpenBillPdf, but sends it straight to print. */
export function usePrintBillPdf() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.get(`/billing/${id}/pdf`, { responseType: 'blob' });
      printPdfBlob(res.data as Blob);
    },
  });
}
