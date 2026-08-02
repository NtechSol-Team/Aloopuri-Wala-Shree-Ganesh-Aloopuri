'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ClipboardList, Package } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatQty, todayIso } from '@/lib/utils';
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
  const range = periodRange(period, custom);
  const { data, isLoading } = useOrderSummary({
    ...(isFulfiller && effectiveOutletId ? { outletId: effectiveOutletId } : {}),
    ...range,
  });

  const days = data?.days ?? [];

  return (
    <div className="space-y-5">
      <p className="text-body text-muted-foreground">
        Product-wise quantities ordered each day. Cancelled orders are left out.
      </p>

      <Card className="flex flex-wrap items-end gap-3 p-3">
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
        days.map((day) => (
          <Card key={day.day} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
              <h3 className="text-card-title font-semibold">{formatDayLabel(day.day)}</h3>
              <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
                <Package className="h-3.5 w-3.5" />
                {day.products.length} product{day.products.length === 1 ? '' : 's'}
              </span>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Product</TH><TH>SKU</TH>
                  <TH className="text-right">Quantity Ordered</TH>
                  <TH className="text-right">Orders</TH>
                </TR>
              </THead>
              <TBody>
                {day.products.map((p) => (
                  <TR key={p.productId}>
                    <TD className="font-medium">{p.productName}</TD>
                    <TD className="text-muted-foreground">{p.sku}</TD>
                    <TD className="text-right font-semibold tabular-nums">
                      {formatQty(p.quantity, p.decimalPlaces)} {p.unitName}
                    </TD>
                    <TD className="text-right tabular-nums text-muted-foreground">{p.orderCount}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        ))
      )}
    </div>
  );
}
