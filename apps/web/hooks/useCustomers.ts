'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export interface Customer {
  id: string;
  name: string;
  gstin: string | null;
  legalName: string | null;
  tradeName: string | null;
  stateCode: string | null;
  stateName: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
}

export interface CustomerPayload {
  id?: string;
  name: string;
  gstin?: string;
  legalName?: string;
  tradeName?: string;
  stateCode?: string;
  stateName?: string;
  address?: string;
  phone?: string;
  email?: string;
}

export function useCustomers(params: { search?: string } = {}) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: async () => (await api.get<ApiSuccess<Customer[]>>('/customers', { params: { limit: 100, ...params } })).data.data,
  });
}

export function useSaveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: CustomerPayload) =>
      id ? (await api.patch<ApiSuccess<Customer>>(`/customers/${id}`, input)).data.data : (await api.post<ApiSuccess<Customer>>('/customers', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/customers/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}
