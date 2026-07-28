'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getDevKey } from '@/store/dev.store';
import type { ApiSuccess } from '@/types/api';

export type DeveloperPaymentScope = 'MAIN_ADMIN' | 'OUTLET';
export type RenewalStatus = 'NEVER_PAID' | 'OVERDUE' | 'DUE_SOON' | 'OK';

export interface DeveloperPaymentRecord {
  id: string;
  amount: string;
  method: string | null;
  paidOn: string;
  renewalDate: string;
  notes: string | null;
}

export interface DeveloperPaymentClient {
  scope: DeveloperPaymentScope;
  outletId: string | null;
  name: string;
  isActive: boolean;
  lastPayment: DeveloperPaymentRecord | null;
  status: RenewalStatus;
  daysUntilRenewal: number | null;
  history: DeveloperPaymentRecord[];
}

export interface SaveDeveloperPaymentInput {
  scope: DeveloperPaymentScope;
  outletId?: string;
  amount: number;
  method?: string;
  paidOn: string;
  renewalDate?: string;
  notes?: string;
}

/** This whole module is developer-passphrase-gated — every call carries the key header. */
function devHeaders() {
  return { headers: { 'x-developer-key': getDevKey() ?? '' } };
}

export function useDeveloperPaymentClients(enabled: boolean) {
  return useQuery({
    queryKey: ['developer-payments', 'clients'],
    enabled,
    queryFn: async () => (await api.get<ApiSuccess<DeveloperPaymentClient[]>>('/developer-payments/clients', devHeaders())).data.data,
  });
}

export function useSaveDeveloperPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveDeveloperPaymentInput) =>
      (await api.post<ApiSuccess<unknown>>('/developer-payments', input, devHeaders())).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['developer-payments'] }),
  });
}

export function useDeleteDeveloperPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/developer-payments/${id}`, devHeaders())).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['developer-payments'] }),
  });
}
