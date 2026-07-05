'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export type MeasurementUnit = 'KG' | 'GRAM' | 'LITRE' | 'ML' | 'PIECE' | 'PACKET' | 'BOX' | 'DOZEN';
export const UNITS: MeasurementUnit[] = ['KG', 'GRAM', 'LITRE', 'ML', 'PIECE', 'PACKET', 'BOX', 'DOZEN'];

export interface Category {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  _count?: { products: number };
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  unit: MeasurementUnit;
  basePrice: string;
  mrp: string;
  taxPercent: string;
  reorderLevel: string;
  photoUrl: string | null;
  batchTrackingEnabled: boolean;
  isActive: boolean;
  isPosEnabled: boolean;
  category: { id: string; name: string };
}

export interface RawMaterial {
  id: string;
  name: string;
  unit: MeasurementUnit;
  supplierName: string | null;
  reorderLevel: string;
  currentStock: string;
  costPerUnit: string;
  isActive: boolean;
}

export interface BomItem {
  id: string;
  rawMaterialId: string;
  quantity: string;
  rawMaterial: { id: string; name: string; unit: MeasurementUnit; costPerUnit: string };
}

// ── Categories ──
export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<ApiSuccess<Category[]>>('/categories')).data.data,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) =>
      (await api.post<ApiSuccess<Category>>('/categories', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

// ── Products ──
export function useProducts(params: { search?: string; categoryId?: string; page?: number } = {}) {
  return useQuery({
    queryKey: ['products', params],
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<Product[]>>('/products', { params: { limit: 100, ...params } });
      return { rows: data.data, meta: data.meta };
    },
  });
}

type ProductPayload = {
  name: string; sku: string; categoryId: string; unit: MeasurementUnit;
  basePrice: number; mrp: number; taxPercent: number; reorderLevel: number; batchTrackingEnabled: boolean;
  isPosEnabled: boolean;
};

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<ProductPayload> & { id?: string }) =>
      id
        ? (await api.patch<ApiSuccess<Product>>(`/products/${id}`, input)).data.data
        : (await api.post<ApiSuccess<Product>>('/products', input)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/products/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });
}

// ── BOM ──
export function useBom(productId: string | null) {
  return useQuery({
    queryKey: ['bom', productId],
    enabled: !!productId,
    queryFn: async () => (await api.get<ApiSuccess<BomItem[]>>(`/products/${productId}/bom`)).data.data,
  });
}

export function useSaveBom(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: Array<{ rawMaterialId: string; quantity: number }>) =>
      (await api.put<ApiSuccess<BomItem[]>>(`/products/${productId}/bom`, { items })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bom', productId] }),
  });
}

// ── Raw materials ──
export function useRawMaterials(params: { search?: string; lowStockOnly?: boolean } = {}) {
  return useQuery({
    queryKey: ['raw-materials', params],
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<RawMaterial[]>>('/raw-materials', { params: { limit: 100, ...params } });
      return { rows: data.data, meta: data.meta };
    },
  });
}

type RawMaterialPayload = {
  name: string; unit: MeasurementUnit; supplierName?: string;
  reorderLevel: number; currentStock: number; costPerUnit: number;
};

export function useSaveRawMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<RawMaterialPayload> & { id?: string }) =>
      id
        ? (await api.patch<ApiSuccess<RawMaterial>>(`/raw-materials/${id}`, input)).data.data
        : (await api.post<ApiSuccess<RawMaterial>>('/raw-materials', input)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['raw-materials'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
