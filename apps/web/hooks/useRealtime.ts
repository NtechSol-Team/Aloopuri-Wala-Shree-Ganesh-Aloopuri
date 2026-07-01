'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/store/auth.store';
import { useNotificationsStore } from '@/store/notifications.store';

interface RealtimeMessage<T = unknown> {
  event: string;
  data: T;
  emittedAt: string;
}

const EVENT_COPY: Record<string, (data: Record<string, unknown>) => string> = {
  new_order: (d) => `New order ${(d.orderNumber as string) ?? ''} received`,
  order_status_changed: (d) => `Order ${(d.orderNumber as string) ?? ''} → ${(d.status as string) ?? ''}`,
  payment_received: (d) => `Payment received: ₹${(d.amount as number) ?? ''}`,
  bill_generated: (d) => `Bill ${(d.billNumber as string) ?? ''} generated`,
  stock_low: (d) => `Low stock: ${(d.productName as string) ?? 'a product'}`,
  transfer_status_changed: (d) => `Transfer ${(d.transferNumber as string) ?? ''} → ${(d.status as string) ?? ''}`,
  report_ready: () => `Your download is ready`,
};

// Which React Query keys to invalidate when an event arrives.
const INVALIDATE_ON: Record<string, string[]> = {
  new_order: ['orders', 'dashboard'],
  order_status_changed: ['orders', 'dashboard'],
  payment_received: ['payments', 'bills', 'dashboard'],
  bill_generated: ['bills', 'dashboard'],
  stock_low: ['inventory', 'dashboard'],
  transfer_status_changed: ['transfers', 'inventory'],
};

/**
 * Establish the realtime connection and wire incoming events to toasts,
 * the notification bell, and React Query cache invalidation.
 */
export function useRealtimeNotifications() {
  const token = useAuthStore((s) => s.accessToken);
  const push = useNotificationsStore((s) => s.push);
  const unread = useNotificationsStore((s) => s.unread);
  const clear = useNotificationsStore((s) => s.clear);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!token) return;
    const socket = getSocket();
    if (!socket) return;

    const handler = (msg: RealtimeMessage) => {
      const copy = EVENT_COPY[msg.event]?.(msg.data as Record<string, unknown>) ?? msg.event;
      push({ event: msg.event, message: copy });
      toast(copy, { icon: '🔔' });
      for (const key of INVALIDATE_ON[msg.event] ?? []) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    };

    for (const event of Object.keys(EVENT_COPY)) socket.on(event, handler);
    return () => {
      for (const event of Object.keys(EVENT_COPY)) socket.off(event, handler);
    };
  }, [token, push, queryClient]);

  useEffect(() => () => disconnectSocket(), []);

  return { unread, clear };
}
