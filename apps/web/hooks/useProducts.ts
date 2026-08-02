'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';
import type { Unit } from './useUnits';

/** Units are maintained in the Item Master, so an item carries its unit inline. */
export type ItemUnit = Pick<Unit, 'id' | 'name' | 'decimalPlaces'>;

export type CategoryType = 'FINISHED_GOODS' | 'RAW_MATERIAL';

export const CATEGORY_TYPE_LABEL: Record<CategoryType, string> = {
  FINISHED_GOODS: 'Finished Goods',
  RAW_MATERIAL: 'Raw Materials',
};

export interface Category {
  id: string;
  name: string;
  description?: string | null;
  type: CategoryType;
  isActive: boolean;
  _count?: { products: number; rawMaterials: number };
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  unit: ItemUnit;
  basePrice: string;
  mrp: string;
  taxPercent: string;
  reorderLevel: string;
  photoUrl: string | null;
  batchTrackingEnabled: boolean;
  isActive: boolean;
  isPosEnabled: boolean;
  trackInventory: boolean;
  avgCost: string;
  category: { id: string; name: string; type: CategoryType };
  godownStock: { quantity: string } | null;
}

export interface RawMaterial {
  id: string;
  name: string;
  unit: ItemUnit;
  category: { id: string; name: string; type: CategoryType } | null;
  supplierName: string | null;
  reorderLevel: string;
  currentStock: string;
  costPerUnit: string;
  hsnCode: string | null;
  taxPercent: string;
  isActive: boolean;
}

export type BomComponentType = 'RAW_MATERIAL' | 'PRODUCT';

export interface BomItem {
  id: string;
  componentType: BomComponentType;
  rawMaterialId: string | null;
  componentProductId: string | null;
  quantity: string;
  rawMaterial: { id: string; name: string; unit: ItemUnit; costPerUnit: string } | null;
  componentProduct: { id: string; name: string; unit: ItemUnit; avgCost: string } | null;
}

export type BomLineInput =
  | { componentType: 'RAW_MATERIAL'; rawMaterialId: string; quantity: number }
  | { componentType: 'PRODUCT'; componentProductId: string; quantity: number };

// ── Categories ──
/** Pass a `type` to get only Finished Goods or only Raw Material categories. */
export function useCategories(params: { type?: CategoryType } = {}) {
  return useQuery({
    queryKey: ['categories', params],
    queryFn: async () => (await api.get<ApiSuccess<Category[]>>('/categories', { params })).data.data,
  });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; type?: CategoryType }) =>
      (await api.post<ApiSuccess<Category>>('/categories', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id?: string; name: string; description?: string; type: CategoryType }) =>
      id
        ? (await api.patch<ApiSuccess<Category>>(`/categories/${id}`, input)).data.data
        : (await api.post<ApiSuccess<Category>>('/categories', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/categories/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

// ── Products ──
export function useProducts(params: { search?: string; categoryId?: string; page?: number; isPosEnabled?: boolean } = {}, enabled = true) {
  return useQuery({
    queryKey: ['products', params],
    enabled,
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<Product[]>>('/products', { params: { limit: 100, ...params } });
      return { rows: data.data, meta: data.meta };
    },
  });
}

type ProductPayload = {
  name: string; sku: string; categoryId: string; unitId: string;
  basePrice: number; mrp: number; taxPercent: number; reorderLevel: number; batchTrackingEnabled: boolean;
  isPosEnabled: boolean; trackInventory: boolean;
  // Create-only — the server ignores it on update. See products.schema.ts.
  openingStock?: number;
  // Edit-only — a delta added to Godown stock, never a replacement value.
  addStock?: number;
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
      // A product save can flip isPosEnabled — keep the POS terminal's product list in sync.
      qc.invalidateQueries({ queryKey: ['pos', 'products'] });
    },
  });
}

/** Upload/replace a product's photo (multipart). Returns the updated product. */
export function useUploadProductPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return (await api.post<ApiSuccess<Product>>(`/products/${id}/photo`, form)).data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['pos', 'products'] });
    },
  });
}

/** Clear a product's photo, falling back to its keyword-matched stock image (if any). */
export function useRemoveProductPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete<ApiSuccess<Product>>(`/products/${id}/photo`)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['pos', 'products'] });
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/products/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['pos', 'products'] });
    },
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
    mutationFn: async (items: BomLineInput[]) =>
      (await api.put<ApiSuccess<BomItem[]>>(`/products/${productId}/bom`, { items })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bom', productId] }),
  });
}

// ── Raw materials ──
export function useRawMaterials(params: { search?: string; lowStockOnly?: boolean } = {}, enabled = true) {
  return useQuery({
    queryKey: ['raw-materials', params],
    enabled,
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<RawMaterial[]>>('/raw-materials', { params: { limit: 100, ...params } });
      return { rows: data.data, meta: data.meta };
    },
  });
}

type RawMaterialPayload = {
  name: string; unitId: string; categoryId?: string; supplierName?: string;
  reorderLevel: number; currentStock: number; costPerUnit: number;
  hsnCode?: string; taxPercent: number;
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

export function useDeleteRawMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/raw-materials/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['raw-materials'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
