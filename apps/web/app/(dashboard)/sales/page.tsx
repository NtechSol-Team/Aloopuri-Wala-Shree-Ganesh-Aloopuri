'use client';

import { useState } from 'react';
import { ShoppingCart, ReceiptText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { OrdersTab } from '@/components/sales/orders-tab';
import { BillsTab } from '@/components/sales/bills-tab';

/**
 * Sales groups the two halves of the customer-facing flow: the orders outlets place,
 * and the bills those orders raise once fulfilled. They were separate top-level pages
 * before; nothing about either changed, they just live under one heading now.
 */
type Tab = 'orders' | 'bills';

const TABS: Array<[Tab, string, typeof ShoppingCart]> = [
  ['orders', 'Orders', ShoppingCart],
  ['bills', 'Bills', ReceiptText],
];

export default function SalesPage() {
  const [tab, setTab] = useState<Tab>('orders');

  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-border">
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-4 py-2 text-body font-medium transition-colors',
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'orders' && <OrdersTab />}
      {tab === 'bills' && <BillsTab />}
    </div>
  );
}
