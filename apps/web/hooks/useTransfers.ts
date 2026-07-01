'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export type TransferStatus = 'DRAFT' | 'DISPATCHED' | 'RECEIVED' | 'CANCELLED';

export interface TransferItem {
  id: string;
  quantity: string;
  product: { id: string; name: string; unit: string };
}
export interface Transfer {
  id: string;
  transferNumber: string;
  status: TransferStatus;
  destinationType: 'MAIN_BRANCH' | 'OUTLET';
  destinationOutlet: { id: string; name: string } | null;
  transferDate: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
  vehicleNumber: string | null;
  notes: string | null;
  items: TransferItem[];
}

export function useTransfers(params: { status?: TransferStatus } = {}) {
  return useQuery({
    queryKey: ['transfers', params],
    queryFn: async () => (await api.get<ApiSuccess<Transfer[]>>('/transfers', { params: { limit: 100, ...params } })).data.data,
  });
}

export function useCreateTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { destinationType?: 'MAIN_BRANCH' | 'OUTLET'; destinationOutletId?: string; vehicleNumber?: string; notes?: string; items: Array<{ productId: string; quantity: number }> }) =>
      (await api.post<ApiSuccess<Transfer>>('/transfers', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers'] }),
  });
}

export function useUpdateTransferStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TransferStatus }) =>
      (await api.patch<ApiSuccess<Transfer>>(`/transfers/${id}/status`, { status })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transfers'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}
