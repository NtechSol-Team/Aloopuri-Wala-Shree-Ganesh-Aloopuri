'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export type ContactType = 'CUSTOMER' | 'SUPPLIER' | 'OTHER';

export interface Contact {
  id: string;
  type: ContactType;
  name: string;
  gstin: string | null;
  legalName: string | null;
  tradeName: string | null;
  stateCode: string | null;
  stateName: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  bankAccountHolder: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  isActive: boolean;
}

export interface ContactPayload {
  id?: string;
  type: ContactType;
  name: string;
  gstin?: string;
  legalName?: string;
  tradeName?: string;
  stateCode?: string;
  stateName?: string;
  address?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  bankAccountHolder?: string;
  bankName?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
}

export function useContacts(params: { search?: string; type?: ContactType } = {}) {
  return useQuery({
    queryKey: ['contacts', params],
    queryFn: async () => (await api.get<ApiSuccess<Contact[]>>('/contacts', { params: { limit: 100, ...params } })).data.data,
  });
}

export function useSaveContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ContactPayload) =>
      id ? (await api.patch<ApiSuccess<Contact>>(`/contacts/${id}`, input)).data.data : (await api.post<ApiSuccess<Contact>>('/contacts', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/contacts/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });
}
