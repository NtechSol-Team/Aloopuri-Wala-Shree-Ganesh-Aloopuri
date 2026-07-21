'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export type MeasurementUnit = 'KG' | 'GRAM' | 'LITRE' | 'ML' | 'PIECE' | 'PACKET' | 'BOX' | 'DOZEN';

export interface MenuOutletRef { id: string; name: string; code: string }

export interface MenuSummary {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  _count: { items: number; outlets: number };
  outlets: MenuOutletRef[];
}

export interface MenuCategory { id: string; name: string; displayOrder: number }

export interface MenuItem {
  id: string;
  name: string;
  code: string | null;
  unit: MeasurementUnit;
  price: string;
  taxPercent: string;
  photoUrl: string | null;
  displayOrder: number;
  isAvailable: boolean;
  categoryId: string | null;
}

export interface MenuDetail {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  isActive: boolean;
  categories: MenuCategory[];
  items: MenuItem[];
  outlets: MenuOutletRef[];
}

export interface CreateMenuInput { name: string; description?: string | null; importFromMenuId?: string }
export interface MenuItemInput {
  name: string;
  categoryId?: string | null;
  code?: string | null;
  unit?: MeasurementUnit;
  price: number;
  taxPercent?: number;
  isAvailable?: boolean;
}

const key = {
  all: ['menus'] as const,
  detail: (id: string) => ['menus', id] as const,
};

export function useMenus() {
  return useQuery({
    queryKey: key.all,
    queryFn: async () => (await api.get<ApiSuccess<MenuSummary[]>>('/menus')).data.data,
  });
}

export function useMenu(id: string | null) {
  return useQuery({
    queryKey: id ? key.detail(id) : ['menus', 'none'],
    enabled: !!id,
    queryFn: async () => (await api.get<ApiSuccess<MenuDetail>>(`/menus/${id}`)).data.data,
  });
}

export function useCreateMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateMenuInput) => (await api.post<ApiSuccess<MenuDetail>>('/menus', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: key.all }),
  });
}

export function useUpdateMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string; name?: string; description?: string | null; isActive?: boolean; isDefault?: boolean }) =>
      (await api.patch<ApiSuccess<MenuSummary>>(`/menus/${id}`, input)).data.data,
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: key.all }); qc.invalidateQueries({ queryKey: key.detail(v.id) }); },
  });
}

export function useDeleteMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/menus/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: key.all }),
  });
}

// ── Categories ──
export function useCreateMenuCategory(menuId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => (await api.post(`/menus/${menuId}/categories`, { name })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: key.detail(menuId) }),
  });
}
export function useUpdateMenuCategory(menuId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: string; name?: string; displayOrder?: number }) =>
      (await api.patch(`/menus/${menuId}/categories/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: key.detail(menuId) }),
  });
}
export function useDeleteMenuCategory(menuId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/menus/${menuId}/categories/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: key.detail(menuId) }),
  });
}

// ── Items ──
export function useSaveMenuItem(menuId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: MenuItemInput & { id?: string }) =>
      id
        ? (await api.patch<ApiSuccess<MenuItem>>(`/menus/${menuId}/items/${id}`, input)).data.data
        : (await api.post<ApiSuccess<MenuItem>>(`/menus/${menuId}/items`, input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: key.detail(menuId) }),
  });
}
export function useDeleteMenuItem(menuId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/menus/${menuId}/items/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: key.detail(menuId) }),
  });
}
export function useUploadMenuItemPhoto(menuId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return (await api.post<ApiSuccess<MenuItem>>(`/menus/${menuId}/items/${id}/photo`, form)).data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key.detail(menuId) }),
  });
}
export function useRemoveMenuItemPhoto(menuId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete<ApiSuccess<MenuItem>>(`/menus/${menuId}/items/${id}/photo`)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: key.detail(menuId) }),
  });
}
