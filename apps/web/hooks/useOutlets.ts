'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
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

export function useOutlets() {
  return useQuery({
    queryKey: ['outlets'],
    queryFn: async () => (await api.get<ApiSuccess<Outlet[]>>('/outlets')).data.data,
  });
}

export function useSaveOutlet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Outlet> & { id?: string; name: string; code: string }) =>
      id
        ? (await api.patch<ApiSuccess<Outlet>>(`/outlets/${id}`, input)).data.data
        : (await api.post<ApiSuccess<Outlet>>('/outlets', input)).data.data,
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
      (await api.put<ApiSuccess<OutletPriceRow[]>>(`/outlets/${outletId}/prices`, { items })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlets', outletId, 'prices'] }),
  });
}
