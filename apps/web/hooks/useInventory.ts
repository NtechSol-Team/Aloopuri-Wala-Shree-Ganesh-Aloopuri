'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export interface StockRow {
  quantity: string;
  product: { id: string; name: string; sku: string; unit: string; reorderLevel?: string };
}
export interface RawRow {
  id: string; name: string; unit: string; currentStock: string; reorderLevel: string; costPerUnit: string; supplierName: string | null;
}
export interface InventorySummary {
  godownUnits: number; mainBranchUnits: number; outletUnits: number; rawMaterialCount: number; lowStockCount: number;
}

export function useInventorySummary() {
  return useQuery({ queryKey: ['inventory', 'summary'], queryFn: async () => (await api.get<ApiSuccess<InventorySummary>>('/inventory/summary')).data.data });
}
export function useGodownInventory() {
  return useQuery({ queryKey: ['inventory', 'godown'], queryFn: async () => (await api.get<ApiSuccess<{ finishedGoods: StockRow[]; rawMaterials: RawRow[] }>>('/inventory/godown')).data.data });
}
export function useMainBranchInventory() {
  return useQuery({ queryKey: ['inventory', 'main-branch'], queryFn: async () => (await api.get<ApiSuccess<StockRow[]>>('/inventory/main-branch')).data.data });
}
export function useOutletInventory(outletId: string | null) {
  return useQuery({
    queryKey: ['inventory', 'outlet', outletId],
    enabled: !!outletId,
    queryFn: async () => (await api.get<ApiSuccess<{ outlet: { id: string; name: string }; items: StockRow[] }>>(`/inventory/outlet/${outletId}`)).data.data,
  });
}
