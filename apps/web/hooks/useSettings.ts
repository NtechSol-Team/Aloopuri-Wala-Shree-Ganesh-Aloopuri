'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

/** The number a franchise owner's Call button dials — set by the main owner. */
export function useCallNumber() {
  return useQuery({
    queryKey: ['settings', 'call-number'],
    queryFn: async () => (await api.get<ApiSuccess<{ phone: string | null }>>('/settings/call-number')).data.data,
  });
}

export function useUpdateCallNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (phone: string) => (await api.put<ApiSuccess<{ phone: string | null }>>('/settings/call-number', { phone })).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'call-number'] }),
  });
}
