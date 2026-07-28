'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getDevKey } from '@/store/dev.store';
import type { ApiSuccess } from '@/types/api';

export type UserRoleName = 'SUPER_ADMIN' | 'GODOWN_MANAGER' | 'FRANCHISE_OWNER' | 'CASHIER';

export interface OnlineUser {
  userId: string;
  name: string;
  role: UserRoleName;
  outletId: string | null;
  onlineSince: string;
}

export interface ActivityTotal {
  userId: string;
  name: string;
  role: UserRoleName;
  outletName: string | null;
  activeSeconds: number;
  isOnline: boolean;
}

/** Developer-passphrase gated, same as the payments module. */
function devHeaders() {
  return { headers: { 'x-developer-key': getDevKey() ?? '' } };
}

export function useOnlineUsers(enabled: boolean) {
  return useQuery({
    queryKey: ['developer-presence', 'online'],
    enabled,
    queryFn: async () => (await api.get<ApiSuccess<OnlineUser[]>>('/developer-presence/online', devHeaders())).data.data,
  });
}

export function useTodayActivityTotals(enabled: boolean) {
  return useQuery({
    queryKey: ['developer-presence', 'today'],
    enabled,
    queryFn: async () => (await api.get<ApiSuccess<ActivityTotal[]>>('/developer-presence/today', devHeaders())).data.data,
  });
}
