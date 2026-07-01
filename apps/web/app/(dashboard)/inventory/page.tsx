'use client';

import { useEffect, useState } from 'react';
import { Warehouse, Store, Boxes, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { cn, formatINR } from '@/lib/utils';
import { useInventorySummary, useGodownInventory, useMainBranchInventory, useOutletInventory, type StockRow } from '@/hooks/useInventory';
import { useOutlets } from '@/hooks/useOutlets';

type Tab = 'godown' | 'main' | 'outlets';

export default function InventoryPage() {
  const [tab, setTab] = useState<Tab>('godown');
  const { data: summary, isLoading: sLoading } = useInventorySummary();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {sLoading || !summary ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
        ) : (
          <>
            <KpiCard label="Godown Units" value={String(summary.godownUnits)} icon={Warehouse} accent="primary" />
            <KpiCard label="Main Branch Units" value={String(summary.mainBranchUnits)} icon={Store} accent="primary" />
            <KpiCard label="Outlet Units" value={String(summary.outletUnits)} icon={Boxes} accent="primary" />
            <KpiCard label="Low Stock Alerts" value={String(summary.lowStockCount)} icon={AlertTriangle} accent="danger" />
          </>
        )}
      </div>

      <div className="flex gap-1 border-b border-border">
        {([['godown', 'Godown'], ['main', 'Main Branch'], ['outlets', 'Outlets']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={cn('border-b-2 px-4 py-2 text-body font-medium transition-colors', tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{label}</button>
        ))}
      </div>

      {tab === 'godown' && <GodownTab />}
      {tab === 'main' && <MainBranchTab />}
      {tab === 'outlets' && <OutletsTab />}
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
                    <TD className={cn('text-right', low && 'font-semibold text-danger')}>{Number(m.currentStock)} {m.unit}</TD>
                    <TD className="text-right">{Number(m.reorderLevel)}</TD>
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

function MainBranchTab() {
  const { data, isLoading } = useMainBranchInventory();
  if (isLoading || !data) return <CardSkeleton />;
  return <Card className="overflow-hidden"><SectionTitle>Main Branch Stock</SectionTitle><StockTable rows={data} /></Card>;
}

function OutletsTab() {
  const { data: outlets } = useOutlets();
  const [outletId, setOutletId] = useState<string | null>(null);
  useEffect(() => { if (outlets?.length && !outletId) setOutletId(outlets[0].id); }, [outlets, outletId]);
  const { data, isLoading } = useOutletInventory(outletId);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <h3 className="text-card-title font-semibold">Outlet Stock</h3>
        <Select className="w-56" value={outletId ?? ''} onChange={(e) => setOutletId(e.target.value)}>
          {outlets?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      </div>
      {isLoading || !data ? <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div> : <StockTable rows={data.items} />}
    </Card>
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
              <TD className={cn('text-right', low && 'font-semibold text-danger')}>{Number(r.quantity)} {r.product.unit}</TD>
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
