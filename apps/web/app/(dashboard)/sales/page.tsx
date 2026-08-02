'use client';

import { useState } from 'react';
import { ShoppingCart, ReceiptText, ClipboardList, Store, ChevronRight, ArrowLeft, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useOutlets } from '@/hooks/useOutlets';
import { OrdersTab } from '@/components/sales/orders-tab';
import { BillsTab } from '@/components/sales/bills-tab';
import { OrderSummaryTab } from '@/components/sales/order-summary-tab';

/**
 * Sales groups the customer-facing flow: the orders outlets place, the bills those
 * orders raise once fulfilled, and a product-wise summary of what was ordered.
 *
 * The main owner lands on a card per franchise and drills into one, which pins every
 * tab to that outlet. "All Franchises" keeps the unscoped view, where each tab still
 * has its own outlet picker. A franchise owner skips the picker entirely — they are
 * scoped to their own outlet server-side regardless.
 */
type Tab = 'orders' | 'bills' | 'summary';

const TABS: Array<[Tab, string, typeof ShoppingCart]> = [
  ['orders', 'Orders', ShoppingCart],
  ['bills', 'Bills', ReceiptText],
  ['summary', 'Order Summary', ClipboardList],
];

/** null = nothing picked yet (show the cards); 'all' = every outlet, unscoped. */
type Scope = { id: string | 'all'; name: string } | null;

export default function SalesPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'SUPER_ADMIN' || role === 'GODOWN_MANAGER';
  const [scope, setScope] = useState<Scope>(null);

  if (isAdmin && !scope) return <OutletPicker onPick={setScope} />;

  const lockedOutletId = scope && scope.id !== 'all' ? scope.id : undefined;
  return (
    <SalesTabs
      lockedOutletId={lockedOutletId}
      header={
        isAdmin && scope ? (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setScope(null)}>
              <ArrowLeft className="h-4 w-4" /> All outlets
            </Button>
            <div>
              <p className="text-body font-semibold">{scope.name}</p>
              <p className="text-caption text-muted-foreground">Orders, bills and ordered quantities</p>
            </div>
          </div>
        ) : null
      }
    />
  );
}

function SalesTabs({ lockedOutletId, header }: { lockedOutletId?: string; header?: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>('orders');

  return (
    <div className="space-y-5">
      {header}
      <div className="flex gap-2 overflow-x-auto border-b border-border scrollbar-thin">
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2 text-body font-medium transition-colors',
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'orders' && <OrdersTab lockedOutletId={lockedOutletId} />}
      {tab === 'bills' && <BillsTab lockedOutletId={lockedOutletId} />}
      {tab === 'summary' && <OrderSummaryTab lockedOutletId={lockedOutletId} />}
    </div>
  );
}

function OutletPicker({ onPick }: { onPick: (s: Scope) => void }) {
  const { data: outlets } = useOutlets();
  const active = (outlets ?? []).filter((o) => o.isActive);

  return (
    <div className="space-y-3">
      <p className="text-caption text-muted-foreground">
        Pick a franchise to see everything it has ordered and been billed for, or view them all together.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <OutletCard
          name="All Franchises"
          sub="Every outlet together"
          icon={Layers}
          onClick={() => onPick({ id: 'all', name: 'All Franchises' })}
        />
        {active.map((o) => (
          <OutletCard key={o.id} name={o.name} sub={o.code} icon={Store} onClick={() => onPick({ id: o.id, name: o.name })} />
        ))}
      </div>
    </div>
  );
}

function OutletCard({
  name, sub, icon: Icon, onClick,
}: { name: string; sub: string; icon: typeof Store; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-all hover:border-primary/50 hover:shadow-md active:scale-[0.99]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold">{name}</span>
          <span className="block truncate text-caption text-muted-foreground">{sub}</span>
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}
