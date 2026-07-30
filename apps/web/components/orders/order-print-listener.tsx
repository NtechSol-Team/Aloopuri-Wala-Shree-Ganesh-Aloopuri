'use client';

import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import { beepNewOrder } from '@/lib/beep';
import { printOrderPickList } from '@/lib/print';
import { useAuthStore } from '@/store/auth.store';

interface NewOrderPayload {
  orderId: string;
  orderNumber: string;
  outletName: string;
  isGstBill: boolean;
  orderDate: string;
  items: Array<{ name: string; unit: string; qty: number; price: number }>;
  payment?: { status: 'PENDING' | 'PARTIAL' | 'PAID'; amountDue: number; method?: string | null };
}

/**
 * Auto-prints a receipt the instant a new outlet order is placed — no admin
 * approval, credit sign-off, or dispatch action needed first. Mounted once at
 * the dashboard layout so it fires no matter which admin page is open, as
 * long as someone who processes orders (Main Owner or Godown Manager) is
 * logged in with a tab open; printing is inherently device-local, so it can
 * only reach whatever printer this browser/tablet is configured for.
 *
 * Dedup by orderId (a ref, not state) guards against the same event landing
 * twice — e.g. a socket reconnect replaying a recent message.
 */
export function OrderPrintListener() {
  const role = useAuthStore((s) => s.user?.role);
  const printedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (role !== 'SUPER_ADMIN' && role !== 'GODOWN_MANAGER') return;
    const socket = getSocket();
    if (!socket) return;

    const handler = (msg: { data?: NewOrderPayload }) => {
      const d = msg.data;
      if (!d?.orderId || printedIds.current.has(d.orderId)) return;
      printedIds.current.add(d.orderId);
      beepNewOrder();
      printOrderPickList(
        { orderNumber: d.orderNumber, outletName: d.outletName, isGstBill: d.isGstBill, orderDate: d.orderDate, payment: d.payment },
        d.items.map((i) => ({ name: i.name, unit: i.unit, approvedQty: i.qty, price: i.price })),
      );
    };
    socket.on('new_order', handler);
    return () => { socket.off('new_order', handler); };
  }, [role]);

  return null;
}
