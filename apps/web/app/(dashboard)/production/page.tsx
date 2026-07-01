'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  Plus, Pencil, Factory, Boxes, Truck, ArrowRight, AlertTriangle, ShoppingCart, Warehouse,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR } from '@/lib/utils';
import { useRawMaterials, type RawMaterial } from '@/hooks/useProducts';
import { useBatches, useGodownStock, usePurchases } from '@/hooks/useProduction';
import { RawMaterialFormDialog } from '@/components/products/raw-material-form-dialog';
import { LogBatchDialog } from '@/components/production/production-dialogs';

type Tab = 'overview' | 'materials' | 'production' | 'finished';

const TABS: Array<[Tab, string]> = [
  ['overview', 'Overview'],
  ['materials', 'Raw Materials'],
  ['production', 'Production Orders'],
  ['finished', 'Finished Goods'],
];

export default function ProductionPage() {
  const [tab, setTab] = useState<Tab>('overview');
  return (
    <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto border-b border-border scrollbar-thin">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn('whitespace-nowrap border-b-2 px-4 py-2 text-body font-medium transition-colors', tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab onGo={setTab} />}
      {tab === 'materials' && <MaterialsTab />}
      {tab === 'production' && <ProductionTab />}
      {tab === 'finished' && <FinishedTab />}
    </div>
  );
}

// ───────────────────────────── Overview (the chain) ─────────────────────────
function OverviewTab({ onGo }: { onGo: (t: Tab) => void }) {
  const router = useRouter();
  const { data: materials } = useRawMaterials();
  const { data: purchases } = usePurchases();
  const { data: batches } = useBatches();
  const { data: stock } = useGodownStock();

  const lowCount = (materials?.rows ?? []).filter((m) => Number(m.currentStock) < Number(m.reorderLevel)).length;
  const fgUnits = (stock ?? []).reduce((s, r) => s + Number(r.quantity), 0);

  const stages = [
    { icon: Boxes, label: 'Raw Materials', value: `${materials?.rows.length ?? 0}`, sub: lowCount ? `${lowCount} low` : 'in stock', accent: lowCount ? 'text-danger' : 'text-muted-foreground', onClick: () => onGo('materials') },
    { icon: ShoppingCart, label: 'Purchases', value: `${purchases?.length ?? 0}`, sub: 'bills →', accent: 'text-muted-foreground', onClick: () => router.push('/purchases') },
    { icon: Factory, label: 'Production Orders', value: `${batches?.length ?? 0}`, sub: 'batches', accent: 'text-muted-foreground', onClick: () => onGo('production') },
    { icon: Warehouse, label: 'Finished Goods', value: `${fgUnits}`, sub: 'units at godown', accent: 'text-muted-foreground', onClick: () => onGo('finished') },
  ];

  return (
    <div className="space-y-5">
      {/* Pipeline */}
      <Card>
        <CardContent className="flex flex-col items-stretch gap-3 p-5 lg:flex-row lg:items-center">
          {stages.map((s, i) => (
            <div key={s.label} className="flex flex-1 items-center gap-3">
              <button onClick={s.onClick} className="flex flex-1 items-center gap-3 rounded-lg border border-border p-4 text-left transition-shadow hover:shadow-md">
                <div className="flex h-11 w-11 items-center justify-center rounded-md bg-accent text-primary"><s.icon className="h-5 w-5" /></div>
                <div>
                  <p className="text-caption uppercase tracking-wide text-muted-foreground">{s.label}</p>
                  <p className="text-card-title font-bold leading-none">{s.value}</p>
                  <p className={cn('text-caption', s.accent)}>{s.sub}</p>
                </div>
              </button>
              {i < stages.length - 1 && <ArrowRight className="hidden h-5 w-5 shrink-0 text-muted-foreground lg:block" />}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface p-4 text-body text-muted-foreground">
        <Truck className="h-5 w-5 shrink-0 text-primary" />
        Flow: purchase materials/goods (Purchases) → log a production order (auto-consumes materials via BOM) → finished goods land in the godown → transfer to main branch or outlets (Transfers).
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction label="Record Purchase" icon={ShoppingCart} onClick={() => router.push('/purchases')} />
        <QuickAction label="New Production Order" icon={Factory} onClick={() => onGo('production')} />
        <QuickAction label="Add Raw Material" icon={Plus} onClick={() => onGo('materials')} />
        <QuickAction label="View Finished Goods" icon={Warehouse} onClick={() => onGo('finished')} />
      </div>
    </div>
  );
}

function QuickAction({ label, icon: Icon, onClick }: { label: string; icon: typeof Factory; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-left font-medium transition-shadow hover:shadow-md">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><Icon className="h-4 w-4" /></div>
      {label}
    </button>
  );
}

// ───────────────────────────── Raw Materials (master) ───────────────────────
function MaterialsTab() {
  const { data, isLoading } = useRawMaterials();
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <p className="text-body text-muted-foreground">Material master & current godown stock.</p>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add Raw Material</Button>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !data?.rows.length ? (
        <Empty icon={Boxes} text="No raw materials yet." action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add first material</Button>} />
      ) : (
        <Table>
          <THead><TR><TH>Material</TH><TH>Unit</TH><TH>Supplier</TH><TH className="text-right">Stock</TH><TH className="text-right">Reorder</TH><TH className="text-right">Avg Cost</TH><TH className="text-right">Actions</TH></TR></THead>
          <TBody>
            {data.rows.map((m) => {
              const low = Number(m.currentStock) < Number(m.reorderLevel);
              return (
                <TR key={m.id}>
                  <TD className="font-medium">{m.name}</TD>
                  <TD>{m.unit}</TD>
                  <TD className="text-muted-foreground">{m.supplierName ?? '—'}</TD>
                  <TD className={cn('text-right', low && 'font-semibold text-danger')}>
                    <span className="inline-flex items-center gap-1">{low && <AlertTriangle className="h-3.5 w-3.5" />}{Number(m.currentStock)}</span>
                  </TD>
                  <TD className="text-right">{Number(m.reorderLevel)}</TD>
                  <TD className="text-right">{formatINR(m.costPerUnit)}</TD>
                  <TD className="text-right"><Button variant="ghost" size="icon" onClick={() => setEditing(m)}><Pencil className="h-4 w-4" /></Button></TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
      <RawMaterialFormDialog open={creating || !!editing} onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }} material={editing} />
    </Card>
  );
}

// ───────────────────────────── Production Orders ─────────────────────────────
function ProductionTab() {
  const { data, isLoading } = useBatches();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-body text-muted-foreground">Production orders consume raw materials via BOM and add finished goods.</p>
        <Button onClick={() => setOpen(true)}><Factory className="h-4 w-4" /> New Production Order</Button>
      </div>
      {isLoading ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</Card>
      ) : !data?.length ? (
        <Empty icon={Factory} text="No production orders yet." action={<Button onClick={() => setOpen(true)}><Factory className="h-4 w-4" /> Log first order</Button>} card />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead><TR><TH>Batch #</TH><TH>Product</TH><TH className="text-right">Qty</TH><TH className="text-right">Material Cost</TH><TH>Date</TH><TH>Notes</TH></TR></THead>
            <TBody>
              {data.map((b) => (
                <TR key={b.id}>
                  <TD className="font-medium">{b.batchNumber}</TD>
                  <TD>{b.product.name}</TD>
                  <TD className="text-right">{Number(b.quantityProduced)} {b.product.unit}</TD>
                  <TD className="text-right">{formatINR(b.totalMaterialCost)}</TD>
                  <TD>{format(new Date(b.productionDate), 'dd MMM yyyy')}</TD>
                  <TD className="text-muted-foreground">{b.notes ?? '—'}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      <LogBatchDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

// ───────────────────────────── Finished Goods ───────────────────────────────
function FinishedTab() {
  const { data, isLoading } = useGodownStock();
  if (isLoading) return <Card className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</Card>;
  if (!data?.length) return <Empty icon={Warehouse} text="No finished goods at the godown yet." card />;
  return (
    <Card className="overflow-hidden">
      <Table>
        <THead><TR><TH>Product</TH><TH>SKU</TH><TH className="text-right">Godown Qty</TH><TH className="text-right">Reorder</TH><TH>Status</TH></TR></THead>
        <TBody>
          {data.map((s) => {
            const low = Number(s.quantity) < Number(s.product.reorderLevel);
            return (
              <TR key={s.product.id}>
                <TD className="font-medium">{s.product.name}</TD>
                <TD className="text-muted-foreground">{s.product.sku}</TD>
                <TD className={cn('text-right', low && 'font-semibold text-danger')}>{Number(s.quantity)} {s.product.unit}</TD>
                <TD className="text-right">{Number(s.product.reorderLevel)}</TD>
                <TD>{low ? <Badge variant="danger"><AlertTriangle className="mr-1 h-3 w-3" />Low</Badge> : <Badge variant="success">OK</Badge>}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}

function Empty({ icon: Icon, text, action, card }: { icon: typeof Factory; text: string; action?: React.ReactNode; card?: boolean }) {
  const body = (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" />
      <p className="text-body text-muted-foreground">{text}</p>
      {action}
    </div>
  );
  return card ? <Card>{body}</Card> : body;
}
