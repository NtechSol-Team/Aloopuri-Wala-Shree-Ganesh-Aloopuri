'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getDevKey } from '@/store/dev.store';
import type { ApiSuccess } from '@/types/api';

export type PricingMode = 'GENERIC' | 'SPECIAL';

export interface Outlet {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  creditPeriodDays: number;
  pricingMode: PricingMode;
  ownerUserId: string | null;
  isActive: boolean;
}

export interface OutletPriceRow {
  id: string;
  name: string;
  sku: string;
  unit: string;
  basePrice: string;
  specialPrice: string | null;
  category: { name: string };
}

/** Outlet writes are gated by the developer passphrase — sent as a header the API verifies. */
function devHeaders() {
  const key = getDevKey();
  return { headers: { 'x-developer-key': key ?? '' } };
}

export function useOutlets() {
  return useQuery({
    queryKey: ['outlets'],
    queryFn: async () => (await api.get<ApiSuccess<Outlet[]>>('/outlets')).data.data,
  });
}

/** Confirm a developer passphrase against the API; used to unlock the developer window. */
export function useVerifyDeveloperKey() {
  return useMutation({
    mutationFn: async (key: string) =>
      (await api.post<ApiSuccess<{ unlocked: boolean }>>('/outlets/dev/verify', {}, { headers: { 'x-developer-key': key } })).data.data,
  });
}

export function useSaveOutlet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Outlet> & { id?: string; name: string; code: string }) =>
      id
        ? (await api.patch<ApiSuccess<Outlet>>(`/outlets/${id}`, input, devHeaders())).data.data
        : (await api.post<ApiSuccess<Outlet>>('/outlets', input, devHeaders())).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlets'] }),
  });
}

export function useOutletPrices(outletId: string | null) {
  return useQuery({
    queryKey: ['outlets', outletId, 'prices'],
    enabled: !!outletId,
    queryFn: async () => (await api.get<ApiSuccess<OutletPriceRow[]>>(`/outlets/${outletId}/prices`)).data.data,
  });
}

export function useSetOutletPrices(outletId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: Array<{ productId: string; price: number }>) =>
      (await api.put<ApiSuccess<OutletPriceRow[]>>(`/outlets/${outletId}/prices`, { items }, devHeaders())).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlets', outletId, 'prices'] }),
  });
}
