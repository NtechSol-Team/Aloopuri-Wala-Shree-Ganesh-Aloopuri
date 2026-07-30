'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export interface Unit {
  id: string;
  name: string;
  /** How many decimals a quantity in this unit may carry (0-4). */
  decimalPlaces: number;
  isActive: boolean;
  _count?: { products: number; rawMaterials: number; menuItems: number };
}

export interface SaveUnitInput {
  id?: string;
  name: string;
  decimalPlaces: number;
}

export function useUnits() {
  return useQuery({
    queryKey: ['units'],
    queryFn: async () => (await api.get<ApiSuccess<Unit[]>>('/units')).data.data,
  });
}

export function useSaveUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: SaveUnitInput) =>
      id
        ? (await api.patch<ApiSuccess<Unit>>(`/units/${id}`, input)).data.data
        : (await api.post<ApiSuccess<Unit>>('/units', input)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      // A unit's precision is embedded in these payloads, so they go stale together.
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['raw-materials'] });
    },
  });
}

export function useDeleteUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/units/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['units'] }),
  });
}

/** Quantity input step for a unit's precision — 0 decimals ⇒ 1, 2 ⇒ 0.01, etc. */
export function stepFor(decimalPlaces: number): number {
  return 10 ** -decimalPlaces;
}

/** Round a typed quantity down to what its unit actually permits. */
export function roundToUnit(value: number, decimalPlaces: number): number {
  return Number(value.toFixed(decimalPlaces));
}
