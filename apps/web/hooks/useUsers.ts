'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess, UserRole } from '@/types/api';

export interface ManagedUser {
  id: string;
  userId: string;
  email: string;
  name: string;
  phone: string | null;
  role: UserRole;
  outletId: string | null;
  isActive: boolean;
  createdAt: string;
  outlet: { id: string; name: string; code: string } | null;
}

export function useUsers(params: { search?: string; role?: UserRole; isActive?: boolean } = {}) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<ManagedUser[]>>('/users', { params: { limit: 100, ...params } });
      return { rows: data.data, meta: data.meta };
    },
  });
}

export interface UserPayload {
  id?: string;
  name: string;
  email: string;
  password?: string;
  userId?: string;
  phone?: string;
  role: UserRole;
  outletId?: string | null;
}

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: UserPayload) => {
      if (id) {
        const { name, phone, role, outletId } = input;
        return (await api.patch<ApiSuccess<ManagedUser>>(`/users/${id}`, { name, phone, role, outletId })).data.data;
      }
      return (await api.post<ApiSuccess<ManagedUser>>('/users', input)).data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/users/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ id, password }: { id: string; password: string }) => (await api.post(`/users/${id}/reset-password`, { password })).data,
  });
}
