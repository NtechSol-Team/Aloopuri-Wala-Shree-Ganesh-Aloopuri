'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export interface Outlet {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  creditPeriodDays: number;
  ownerUserId: string | null;
  isActive: boolean;
}

export function useOutlets() {
  return useQuery({
    queryKey: ['outlets'],
    queryFn: async () => (await api.get<ApiSuccess<Outlet[]>>('/outlets')).data.data,
  });
}
