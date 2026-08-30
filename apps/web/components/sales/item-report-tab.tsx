'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { BarChart3, Store } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR, formatQtyWithUnit, ist, todayIso } from '@/lib/utils';
import { PERIODS, periodRange, type PeriodKey } from '@/lib/period';
import { useProducts } from '@/hooks/useProducts';
import { useItemSalesReport } from '@/hooks/useBilling';

/**
 * One product, one period: which outlets bought it and how much — the main
 * owner's "who's actually selling item A this month, and for how much" view.
 * Reads sold quantity from bill line items directly, so a Manual Sales Bill
 * counts exactly the same as one raised from a real order.
 */
export function ItemReportTab() {
  const { data: products } = useProducts({ isPosEnabled: false });
  const list = products?.rows ?? [];
  const [productId, setProductId] = useState('');
  // "That month" is the point of the feature, so default there rather than to
  // the wider "All" the other report tabs default to.
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [custom, setCustom] = useState({ from: todayIso(), to: todayIso() });

  useEffect(() => {
    if (!productId && list[0]) setProductId(list[0].id);
  }, [productId, list]);

  const range = periodRange(period, custom);
  const { data, isLoading } = useItemSalesReport({ productId, ...range });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-card-title font-semibold">Item Sales Report</h2>
        <p className="text-caption text-muted-foreground">
          Pick a product to see which franchises bought it, how much, and how much it brought in — each outlet's share.
        </p>
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <Label>Product</Label>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {!list.length && <option value="">No products yet</option>}
            {list.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
          </Select>
        </div>
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
      </Card>

      {!productId ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground" />
          <p className="text-body text-muted-foreground">Add a product to report on it.</p>
        </Card>
      ) : isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-caption uppercase tracking-wide text-muted-foreground">Total Sold {range.from ? `— ${format(ist(range.from), 'MMM yyyy')}` : ''}</p>
              <p className="mt-1 text-card-title font-bold">{formatQtyWithUnit(data.totalQty, { name: data.product.unitName, decimalPlaces: data.product.decimalPlaces })}</p>
            </Card>
            <Card className="p-4">
              <p className="text-caption uppercase tracking-wide text-muted-foreground">Total Revenue</p>
              <p className="mt-1 text-card-title font-bold">{formatINR(data.totalRevenue)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-caption uppercase tracking-wide text-muted-foreground">Collected</p>
              <p className="mt-1 text-card-title font-bold text-success">{formatINR(data.totalCollected)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-caption uppercase tracking-wide text-muted-foreground">Pending</p>
              <p className="mt-1 text-card-title font-bold text-danger">{formatINR(data.totalPending)}</p>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader><CardTitle>{data.product.name} — Outlet-wise</CardTitle></CardHeader>
            {!data.outlets.length ? (
              <div className="flex flex-col items-center gap-3 py-14 text-center">
                <Store className="h-7 w-7 text-muted-foreground" />
                <p className="text-body text-muted-foreground">Nothing sold in this period.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>Franchise</TH><TH className="text-right">Qty</TH><TH className="text-right">Revenue</TH>
                      <TH className="text-right">Collected</TH><TH className="text-right">Pending</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.outlets.map((o) => (
                      <TR key={o.outletId}>
                        <TD className="font-medium">{o.outletName}</TD>
                        <TD className="text-right tabular-nums">{formatQtyWithUnit(o.qty, { name: data.product.unitName, decimalPlaces: data.product.decimalPlaces })}</TD>
                        <TD className="text-right font-medium tabular-nums">{formatINR(o.revenue)}</TD>
                        <TD className="text-right tabular-nums text-success">{formatINR(o.collected)}</TD>
                        <TD className={cn('text-right tabular-nums', o.pending > 0 && 'font-medium text-danger')}>{formatINR(o.pending)}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
