'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { BarChart3, Search, Store } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR, formatQtyWithUnit, ist, todayIso } from '@/lib/utils';
import { PERIODS, periodRange, type PeriodKey } from '@/lib/period';
import { useProducts } from '@/hooks/useProducts';
import { useItemSalesReport, useAllItemsSalesReport } from '@/hooks/useBilling';

/** Distinguishes "every product" from "no product picked yet" — never a real product id. */
const ALL_PRODUCTS = '__all__';

/**
 * One product, one period: which outlets bought it and how much — the main
 * owner's "who's actually selling item A this month, and for how much" view.
 * Reads sold quantity from bill line items directly, so a Manual Sales Bill
 * counts exactly the same as one raised from a real order.
 *
 * Picking "All Products" flips the same report the other way: instead of one
 * product broken down by outlet, it's every product rolled up across all
 * outlets, one row each — searchable, since a real catalog runs to dozens of
 * items and a plain unsorted list wouldn't answer "how's item X doing" any
 * faster than scrolling through the product master itself.
 */
export function ItemReportTab() {
  const { data: products } = useProducts({ isPosEnabled: false });
  const list = products?.rows ?? [];
  const [productId, setProductId] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [custom, setCustom] = useState({ from: todayIso(), to: todayIso() });
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!productId && list[0]) setProductId(list[0].id);
  }, [productId, list]);

  const isAll = productId === ALL_PRODUCTS;
  const range = periodRange(period, custom);
  const single = useItemSalesReport({ productId: isAll ? undefined : productId, ...range });
  const all = useAllItemsSalesReport(range, isAll);

  const filteredProducts = useMemo(() => {
    if (!all.data) return [];
    const q = search.trim().toLowerCase();
    const rows = q ? all.data.products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) : all.data.products;
    return rows;
  }, [all.data, search]);

  const periodLabel = range.from ? `— ${format(ist(range.from), 'MMM yyyy')}` : '';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-card-title font-semibold">Item Sales Report</h2>
        <p className="text-caption text-muted-foreground">
          Pick a product to see which franchises bought it, how much, and how much it brought in — or pick All Products to see every item at once.
        </p>
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div className="min-w-[14rem] flex-1 space-y-1.5">
          <Label>Product</Label>
          <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
            {!list.length && <option value="">No products yet</option>}
            <option value={ALL_PRODUCTS}>All Products</option>
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
        {isAll && (
          <div className="min-w-[12rem] flex-1 space-y-1.5">
            <Label>Search</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Product or SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        )}
      </Card>

      {!productId ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground" />
          <p className="text-body text-muted-foreground">Add a product to report on it.</p>
        </Card>
      ) : isAll ? (
        all.isLoading || !all.data ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card className="p-4">
                <p className="text-caption uppercase tracking-wide text-muted-foreground">Total Revenue {periodLabel}</p>
                <p className="mt-1 text-card-title font-bold">{formatINR(all.data.totalRevenue)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-caption uppercase tracking-wide text-muted-foreground">Collected</p>
                <p className="mt-1 text-card-title font-bold text-success">{formatINR(all.data.totalCollected)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-caption uppercase tracking-wide text-muted-foreground">Pending</p>
                <p className="mt-1 text-card-title font-bold text-danger">{formatINR(all.data.totalPending)}</p>
              </Card>
            </div>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>Every Product — Rolled Up Across Outlets</CardTitle>
                <p className="text-caption text-muted-foreground">
                  {all.data.products.length} item{all.data.products.length === 1 ? '' : 's'} sold{periodLabel ? ` ${periodLabel}` : ''}, highest revenue first.
                </p>
              </CardHeader>
              {!all.data.products.length ? (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <Store className="h-7 w-7 text-muted-foreground" />
                  <p className="text-body text-muted-foreground">Nothing sold in this period.</p>
                </div>
              ) : !filteredProducts.length ? (
                <p className="py-10 text-center text-body text-muted-foreground">No product matches &quot;{search}&quot;.</p>
              ) : (
                <div className="max-h-[65vh] overflow-y-auto overflow-x-auto scrollbar-thin">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Product</TH><TH className="text-right">Qty</TH><TH className="text-right">Revenue</TH>
                        <TH className="text-right">Collected</TH><TH className="text-right">Pending</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {filteredProducts.map((p) => (
                        <TR key={p.productId}>
                          <TD className="font-medium">
                            {p.name}
                            <span className="ml-1.5 text-caption text-muted-foreground">{p.sku}</span>
                          </TD>
                          <TD className="text-right tabular-nums">{formatQtyWithUnit(p.qty, { name: p.unitName, decimalPlaces: p.decimalPlaces })}</TD>
                          <TD className="text-right font-medium tabular-nums">{formatINR(p.revenue)}</TD>
                          <TD className="text-right tabular-nums text-success">{formatINR(p.collected)}</TD>
                          <TD className={cn('text-right tabular-nums', p.pending > 0 && 'font-medium text-danger')}>{formatINR(p.pending)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </Card>
          </>
        )
      ) : single.isLoading || !single.data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-caption uppercase tracking-wide text-muted-foreground">Total Sold {periodLabel}</p>
              <p className="mt-1 text-card-title font-bold">{formatQtyWithUnit(single.data.totalQty, { name: single.data.product.unitName, decimalPlaces: single.data.product.decimalPlaces })}</p>
            </Card>
            <Card className="p-4">
              <p className="text-caption uppercase tracking-wide text-muted-foreground">Total Revenue</p>
              <p className="mt-1 text-card-title font-bold">{formatINR(single.data.totalRevenue)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-caption uppercase tracking-wide text-muted-foreground">Collected</p>
              <p className="mt-1 text-card-title font-bold text-success">{formatINR(single.data.totalCollected)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-caption uppercase tracking-wide text-muted-foreground">Pending</p>
              <p className="mt-1 text-card-title font-bold text-danger">{formatINR(single.data.totalPending)}</p>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader><CardTitle>{single.data.product.name} — Outlet-wise</CardTitle></CardHeader>
            {!single.data.outlets.length ? (
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
                    {single.data.outlets.map((o) => (
                      <TR key={o.outletId}>
                        <TD className="font-medium">{o.outletName}</TD>
                        <TD className="text-right tabular-nums">{formatQtyWithUnit(o.qty, { name: single.data.product.unitName, decimalPlaces: single.data.product.decimalPlaces })}</TD>
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
