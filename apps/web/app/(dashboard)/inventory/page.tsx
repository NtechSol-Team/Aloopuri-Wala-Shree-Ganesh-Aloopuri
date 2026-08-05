'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Warehouse, Boxes, AlertTriangle, ArrowLeftRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { cn, formatINR, formatQty, ist, todayIso } from '@/lib/utils';
import { PERIODS, periodRange, type PeriodKey } from '@/lib/period';
import { useInventorySummary, useGodownInventory, useOutletInventory, useStockMovements, type StockRow, type StockMovementReason } from '@/hooks/useInventory';
import { useOutlets } from '@/hooks/useOutlets';

// Stock lives at the godown and at the outlets — main-branch stock is no longer
// tracked as a location anyone works from, so it isn't shown here at all. Movements
// is the audit trail behind those two: why each godown figure is what it is.
type Tab = 'godown' | 'outlets' | 'movements';

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>('godown');
  const { data: summary, isLoading: sLoading } = useInventorySummary();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {sLoading || !summary ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <KpiCard label="Godown Units" value={String(summary.godownUnits)} icon={Warehouse} accent="primary" />
            <KpiCard label="Outlet Units" value={String(summary.outletUnits)} icon={Boxes} accent="primary" />
            <KpiCard label="Low Stock Alerts" value={String(summary.lowStockCount)} icon={AlertTriangle} accent="danger" />
          </>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-border scrollbar-thin">
        {([['godown', 'Godown'], ['outlets', 'Outlets'], ['movements', 'Stock Movement']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={cn('shrink-0 border-b-2 px-4 py-2 text-body font-medium transition-colors', tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{label}</button>
        ))}
      </div>

      {tab === 'godown' && <GodownTab />}
      {tab === 'outlets' && <OutletsTab />}
      {tab === 'movements' && <MovementsTab />}
    </div>
  );
}

function GodownTab() {
  const { data, isLoading } = useGodownInventory();
  if (isLoading || !data) return <CardSkeleton />;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card className="overflow-hidden">
        <SectionTitle>Finished Goods</SectionTitle>
        <StockTable rows={data.finishedGoods} />
      </Card>
      <Card className="overflow-hidden">
        <SectionTitle>Raw Materials</SectionTitle>
        {!data.rawMaterials.length ? <Empty /> : (
          <Table>
            <THead><TR><TH>Material</TH><TH className="text-right">Stock</TH><TH className="text-right">Reorder</TH><TH className="text-right">Avg Cost</TH><TH>Status</TH></TR></THead>
            <TBody>
              {data.rawMaterials.map((m) => {
                const low = Number(m.currentStock) < Number(m.reorderLevel);
                return (
                  <TR key={m.id}>
                    <TD className="font-medium">{m.name}</TD>
                    <TD className={cn('text-right', low && 'font-semibold text-danger')}>{formatQty(m.currentStock, m.unit.decimalPlaces)} {m.unit.name}</TD>
                    <TD className="text-right">{formatQty(m.reorderLevel, m.unit.decimalPlaces)}</TD>
                    <TD className="text-right">{formatINR(m.costPerUnit)}</TD>
                    <TD>{low ? <Badge variant="danger">Low</Badge> : <Badge variant="success">OK</Badge>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function OutletsTab() {
  const { data: outlets } = useOutlets();
  const [outletId, setOutletId] = useState<string | null>(null);
  useEffect(() => { if (outlets?.length && !outletId) setOutletId(outlets[0].id); }, [outlets, outletId]);
  const { data, isLoading } = useOutletInventory(outletId);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-card-title font-semibold">Outlet Stock</h3>
        <Select className="w-full sm:w-56" value={outletId ?? ''} onChange={(e) => setOutletId(e.target.value)}>
          {outlets?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      </div>
      {isLoading || !data ? <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div> : <StockTable rows={data.items} />}
    </Card>
  );
}

/** How each movement reason should read and colour in the ledger. */
const REASON_META: Record<StockMovementReason, { label: string; variant: 'danger' | 'success' | 'info' }> = {
  ORDER_PLACED: { label: 'Order placed', variant: 'danger' },
  ORDER_FULFILLED: { label: 'Fulfilled', variant: 'danger' },
  ORDER_CANCELLED: { label: 'Order cancelled', variant: 'success' },
};

/**
 * Every godown stock change, newest first. The stock tables only carry a running
 * total, so this is what explains how a product reached the figure it shows —
 * what moved, why, for whom, and the balance it left behind.
 */
function MovementsTab() {
  const { data: outlets } = useOutlets();
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [custom, setCustom] = useState({ from: todayIso(), to: todayIso() });
  const [outletId, setOutletId] = useState('');
  const range = periodRange(period, custom);
  const { data, isLoading } = useStockMovements({ ...(outletId ? { outletId } : {}), ...range });
  const rows = data ?? [];

  return (
    <div className="space-y-4">
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
        <div className="space-y-1.5">
          <Label>Franchise</Label>
          <Select className="w-48" value={outletId} onChange={(e) => setOutletId(e.target.value)}>
            <option value="">All franchises</option>
            {(outlets ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <CardSkeleton />
      ) : !rows.length ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <ArrowLeftRight className="h-8 w-8 text-muted-foreground" />
          <p className="text-body text-muted-foreground">No stock movements in this period.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>When</TH><TH>Product</TH><TH>Reason</TH><TH>Order</TH><TH>Franchise</TH>
                <TH className="text-right">Change</TH><TH className="text-right">Balance After</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((m) => {
                const delta = Number(m.quantityDelta);
                const meta = REASON_META[m.reason];
                return (
                  <TR key={m.id}>
                    <TD className="whitespace-nowrap text-muted-foreground">{format(ist(m.createdAt), 'dd MMM, HH:mm')}</TD>
                    <TD>
                      <span className="font-medium">{m.product.name}</span>
                      <span className="block text-caption text-muted-foreground">{m.product.sku}</span>
                    </TD>
                    <TD><Badge variant={meta.variant}>{meta.label}</Badge></TD>
                    <TD className="text-muted-foreground">{m.order?.orderNumber ?? '—'}</TD>
                    <TD className="text-muted-foreground">{m.outlet?.name ?? '—'}</TD>
                    <TD className={cn('text-right font-semibold tabular-nums', delta < 0 ? 'text-danger' : 'text-success')}>
                      {delta > 0 ? '+' : ''}{formatQty(delta, m.product.unit.decimalPlaces)} {m.product.unit.name}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {formatQty(m.balanceAfter, m.product.unit.decimalPlaces)} {m.product.unit.name}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function StockTable({ rows }: { rows: StockRow[] }) {
  if (!rows.length) return <Empty />;
  return (
    <Table>
      <THead><TR><TH>Product</TH><TH>SKU</TH><TH className="text-right">Qty</TH>{rows[0].product.reorderLevel !== undefined && <TH>Status</TH>}</TR></THead>
      <TBody>
        {rows.map((r) => {
          const reorder = r.product.reorderLevel !== undefined ? Number(r.product.reorderLevel) : undefined;
          const low = reorder !== undefined && Number(r.quantity) < reorder;
          return (
            <TR key={r.product.id}>
              <TD className="font-medium">{r.product.name}</TD>
              <TD className="text-muted-foreground">{r.product.sku}</TD>
              <TD className={cn('text-right', low && 'font-semibold text-danger')}>{formatQty(r.quantity, r.product.unit.decimalPlaces)} {r.product.unit.name}</TD>
              {reorder !== undefined && <TD>{low ? <Badge variant="danger"><AlertTriangle className="mr-1 h-3 w-3" />Low</Badge> : <Badge variant="success">OK</Badge>}</TD>}
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="border-b border-border p-4 text-card-title font-semibold">{children}</h3>;
}
function CardSkeleton() {
  return <Card className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</Card>;
}
function Empty() {
  return <p className="py-12 text-center text-body text-muted-foreground">No stock here yet.</p>;
}
