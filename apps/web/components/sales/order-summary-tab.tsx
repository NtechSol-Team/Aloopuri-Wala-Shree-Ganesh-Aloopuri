'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ClipboardList, Package, Store } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatQty, todayIso } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useOutlets } from '@/hooks/useOutlets';
import { PERIODS, periodRange, type PeriodKey } from '@/lib/period';
import { useOrderSummary } from '@/hooks/useOrders';

/**
 * `day` is already an IST calendar date, so it's built as a plain local date rather
 * than run through `ist()` — passing it through a timezone shift a second time is
 * what lands these labels a day out.
 */
function formatDayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return format(new Date(y, m - 1, d), 'EEEE, dd MMM yyyy');
}

/**
 * How much of each product was ordered, grouped by the day it was ordered on.
 *
 * The order list answers "who owes what"; this answers "what has to be packed" —
 * one row per product with the day's quantity totalled across every order, so the
 * godown can pick against a single list instead of adding up orders by hand.
 * Cancelled orders are excluded server-side.
 */
export function OrderSummaryTab({ lockedOutletId }: { lockedOutletId?: string } = {}) {
  const role = useAuthStore((s) => s.user?.role);
  const isFulfiller = role === 'SUPER_ADMIN' || role === 'GODOWN_MANAGER';
  // Defaults to today: the summary is overwhelmingly a "what do we pack now" view.
  const [period, setPeriod] = useState<PeriodKey>('today');
  const [custom, setCustom] = useState({ from: todayIso(), to: todayIso() });
  const [outletId, setOutletId] = useState('');
  const { data: outlets } = useOutlets();

  const effectiveOutletId = lockedOutletId ?? outletId;
  // With a single outlet in scope the per-outlet rows just repeat its name.
  const showOutletBreakdown = !effectiveOutletId;
  const range = periodRange(period, custom);
  const { data, isLoading } = useOrderSummary({
    ...(isFulfiller && effectiveOutletId ? { outletId: effectiveOutletId } : {}),
    ...range,
  });

  const days = data?.days ?? [];

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-card-title font-semibold">Ordered Quantities</h2>
        <p className="text-caption text-muted-foreground">
          How much of each product was ordered, day by day. Cancelled orders are left out.
        </p>
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-2.5">
        <div className="space-y-1.5">
          <Label>Period</Label>
          <Select className="w-40" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
            {PERIODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
        </div>
        {period === 'custom' && (
          <>
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </div>
          </>
        )}
        {isFulfiller && !lockedOutletId && (
          <div className="space-y-1.5">
            <Label>Franchise</Label>
            <Select className="w-48" value={outletId} onChange={(e) => setOutletId(e.target.value)}>
              <option value="">All franchises</option>
              {(outlets ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </div>
        )}
      </Card>

      {isLoading ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</Card>
      ) : !days.length ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <ClipboardList className="h-8 w-8 text-muted-foreground" />
          <p className="text-body text-muted-foreground">Nothing ordered in this period.</p>
        </Card>
      ) : (
        /* One card per day, and the two questions sit side by side on a wide screen
           rather than stacked — a month of orders was scrolling for pages before. */
        days.map((day) => (
          <Card key={day.day} className="overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-3 py-2">
              <h3 className="font-semibold">{formatDayLabel(day.day)}</h3>
              <span className="flex items-center gap-3 text-caption text-muted-foreground">
                <span className="flex items-center gap-1"><Package className="h-3 w-3" />{day.products.length}</span>
                {showOutletBreakdown && day.outlets.length > 0 && (
                  <span className="flex items-center gap-1"><Store className="h-3 w-3" />{day.outlets.length}</span>
                )}
              </span>
            </div>

            <div className={cn('grid', showOutletBreakdown && day.outlets.length > 0 && 'lg:grid-cols-2 lg:divide-x lg:divide-border')}>
              {/* What has to be made. SKU sits under the name instead of in its own
                  column, so the table still fits once it's only half the width. */}
              <div>
                <div className="flex items-center justify-between px-3 py-1.5 text-caption uppercase tracking-wide text-muted-foreground">
                  <span>Items Ordered</span><span>Qty · Orders</span>
                </div>
                <div className="divide-y divide-border border-t border-border">
                  {day.products.map((p) => (
                    <div key={p.productId} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
                      <span className="min-w-0">
                        <span className="block truncate text-body font-medium">{p.productName}</span>
                        <span className="block truncate text-caption text-muted-foreground">{p.sku}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-body font-semibold tabular-nums">
                          {formatQty(p.quantity, p.decimalPlaces)} {p.unitName}
                        </span>
                        <span className="block text-caption tabular-nums text-muted-foreground">
                          {p.orderCount} order{p.orderCount === 1 ? '' : 's'}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Who it's for. Skipped when the tab is already pinned to one outlet,
                  where it would just repeat the column beside it. */}
              {showOutletBreakdown && day.outlets.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-3 py-1.5 text-caption uppercase tracking-wide text-muted-foreground">
                    <span>Franchise-wise</span><span>Qty</span>
                  </div>
                  <div className="divide-y divide-border border-t border-border">
                    {day.outlets.map((o) => (
                      <div key={o.outletId} className="px-3 py-1.5">
                        <p className="truncate text-body font-medium">{o.outletName}</p>
                        {o.products.map((p) => (
                          <div key={p.productId} className="flex items-baseline justify-between gap-3 text-caption">
                            <span className="min-w-0 truncate text-muted-foreground">{p.productName}</span>
                            <span className="shrink-0 font-medium tabular-nums">
                              {formatQty(p.quantity, p.decimalPlaces)} {p.unitName}
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
