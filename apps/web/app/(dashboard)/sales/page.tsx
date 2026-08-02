'use client';

import { useState } from 'react';
import { ShoppingCart, ReceiptText, Store, ChevronRight, ArrowLeft, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useOutlets } from '@/hooks/useOutlets';
import { OrdersTab } from '@/components/sales/orders-tab';
import { BillsTab } from '@/components/sales/bills-tab';
import { OrderSummaryTab } from '@/components/sales/order-summary-tab';

/**
 * Two halves of the same flow, picked at the top: Order is what outlets asked for,
 * Sale is what they were billed for.
 *
 * For the main owner, Order opens on today's product-wise totals — what actually has
 * to be packed — with a card per franchise underneath; picking one shows just that
 * outlet's orders. Sale has no cards: it is every bill in one list, filterable by
 * franchise from within the tab. A franchise owner has only their own outlet, so they
 * skip the cards and land straight on the list.
 */
type Section = 'orders' | 'sales';

const SECTIONS: Array<[Section, string, typeof ShoppingCart]> = [
  ['orders', 'Order', ShoppingCart],
  ['sales', 'Sale', ReceiptText],
];

/** null = nothing picked yet (show the cards); 'all' = every outlet, unscoped. */
type Scope = { id: string | 'all'; name: string } | null;

export default function SalesPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'SUPER_ADMIN' || role === 'GODOWN_MANAGER';
  const [section, setSection] = useState<Section>('orders');
  const [scope, setScope] = useState<Scope>(null);

  // Switching section drops back to the cards — the outlet picked for orders isn't
  // necessarily the one you want to read bills for.
  const switchSection = (next: Section) => {
    setSection(next);
    setScope(null);
  };

  const lockedOutletId = scope && scope.id !== 'all' ? scope.id : undefined;
  const showCards = isAdmin && !scope;

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto border-b border-border scrollbar-thin">
        {SECTIONS.map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => switchSection(key)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2 text-body font-medium transition-colors',
              section === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {section === 'orders' && scope && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setScope(null)}>
            <ArrowLeft className="h-4 w-4" /> All outlets
          </Button>
          <div>
            <p className="text-body font-semibold">{scope.name}</p>
            <p className="text-caption text-muted-foreground">Orders placed by this outlet</p>
          </div>
        </div>
      )}

      {section === 'orders' ? (
        showCards ? (
          <>
            {/* What has to be packed today, across every outlet — the first thing
                the owner needs before drilling into who ordered it. */}
            <OrderSummaryTab />
            <OutletPicker label="Pick a franchise to see every order it has placed." onPick={setScope} />
          </>
        ) : (
          <OrdersTab lockedOutletId={lockedOutletId} />
        )
      ) : (
        // Bills are one flat list of every sale, no outlet drill-down — the tab's
        // own franchise filter is there to narrow it when that's wanted.
        <BillsTab />
      )}
    </div>
  );
}

function OutletPicker({ label, onPick }: { label: string; onPick: (s: Scope) => void }) {
  const { data: outlets } = useOutlets();
  const active = (outlets ?? []).filter((o) => o.isActive);

  return (
    <div className="space-y-3">
      <p className="text-caption text-muted-foreground">{label}</p>
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
