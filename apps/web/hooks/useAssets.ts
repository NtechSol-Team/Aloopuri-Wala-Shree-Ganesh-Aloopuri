'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export type AssetStatus = 'IN_USE' | 'IN_REPAIR' | 'RETIRED';
export type AssetLocation = 'GODOWN' | 'MAIN_BRANCH' | 'GENERAL';

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  IN_USE: 'In use',
  IN_REPAIR: 'In repair',
  RETIRED: 'Retired',
};

export const ASSET_LOCATION_LABEL: Record<AssetLocation, string> = {
  GODOWN: 'Godown',
  MAIN_BRANCH: 'Main Branch',
  GENERAL: 'General',
};

export interface Asset {
  id: string;
  assetCode: string;
  name: string;
  description: string | null;
  serialNumber: string | null;
  quantity: string;
  purchaseCost: string;
  purchaseDate: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  location: AssetLocation;
  status: AssetStatus;
  notes: string | null;
  isActive: boolean;
  /** Set when the asset came in on a purchase bill — those are edited via the bill. */
  supplierBillId: string | null;
  supplierBill: { id: string; billNumber: string } | null;
}

export interface SaveAssetInput {
  id?: string;
  name: string;
  description?: string;
  serialNumber?: string;
  quantity: number;
  purchaseCost: number;
  purchaseDate: string;
  supplierName?: string;
  invoiceNumber?: string;
  location: AssetLocation;
  status: AssetStatus;
  notes?: string;
}

export function useAssets(params: { search?: string; status?: AssetStatus; location?: AssetLocation } = {}) {
  return useQuery({
    queryKey: ['assets', params],
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<Asset[]>>('/assets', { params: { limit: 100, ...params } });
      return {
        rows: data.data,
        totalValue: (data.meta as { totalValue?: number } | undefined)?.totalValue ?? 0,
      };
    },
  });
}

export function useSaveAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: SaveAssetInput) =>
      id
        ? (await api.patch<ApiSuccess<Asset>>(`/assets/${id}`, input)).data.data
        : (await api.post<ApiSuccess<Asset>>('/assets', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/assets/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
}
