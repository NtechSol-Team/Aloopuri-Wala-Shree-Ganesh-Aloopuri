'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, apiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { disconnectSocket } from '@/lib/socket';
import type { ApiSuccess, LoginResponse } from '@/types/api';

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);
  const router = useRouter();

  return useMutation({
    mutationFn: async (input: { identifier: string; password: string }) => {
      const { data } = await api.post<ApiSuccess<LoginResponse>>('/auth/login', {
        ...input,
        deviceName: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 80) : undefined,
      });
      return data.data;
    },
    onSuccess: (session) => {
      setSession(session);
      // Cashiers only ever use the POS terminal — skip the (empty, for them)
      // admin dashboard and land straight on the till.
      router.replace(session.user.role === 'CASHIER' ? '/pos' : '/');
    },
    onError: (err) => apiErrorMessage(err),
  });
}

export function useLogout() {
  const clear = useAuthStore((s) => s.clear);
  const router = useRouter();
  return useMutation({
    mutationFn: async () => {
      try {
        await api.post('/auth/logout');
      } catch {
        /* best-effort */
      }
    },
    onSettled: () => {
      disconnectSocket();
      clear();
      router.replace('/login');
    },
  });
}

export function useCurrentUser() {
  return useAuthStore((s) => s.user);
}
