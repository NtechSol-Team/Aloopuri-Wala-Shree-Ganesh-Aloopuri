'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Plus, Pencil, Factory, Boxes, AlertTriangle, Warehouse, Printer,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR, formatQty } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useRawMaterials, type RawMaterial } from '@/hooks/useProducts';
import { useBatches, useGodownStock, fetchBatchDetail } from '@/hooks/useProduction';
import { printBatchLabel } from '@/lib/print';
import { RawMaterialFormDialog } from '@/components/products/raw-material-form-dialog';
import { LogBatchDialog } from '@/components/production/production-dialogs';

type Tab = 'materials' | 'production' | 'finished';

const TABS: Array<[Tab, string]> = [
  ['materials', 'Raw Materials'],
  ['production', 'Production Orders'],
  ['finished', 'Finished Goods'],
];

export default function ProductionPage() {
  const [tab, setTab] = useState<Tab>('materials');
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

      {tab === 'materials' && <MaterialsTab />}
      {tab === 'production' && <ProductionTab />}
      {tab === 'finished' && <FinishedTab />}
    </div>
  );
}

// ───────────────────────────── Raw Materials (master) ───────────────────────
function MaterialsTab() {
  const { data, isLoading } = useRawMaterials();
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
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
                  <TD>{m.unit.name}</TD>
                  <TD className="text-muted-foreground">{m.supplierName ?? '—'}</TD>
                  <TD className={cn('text-right', low && 'font-semibold text-danger')}>
                    <span className="inline-flex items-center gap-1">{low && <AlertTriangle className="h-3.5 w-3.5" />}{formatQty(m.currentStock, m.unit.decimalPlaces)}</span>
                  </TD>
                  <TD className="text-right">{formatQty(m.reorderLevel, m.unit.decimalPlaces)}</TD>
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
            <THead><TR><TH>Batch #</TH><TH>Product</TH><TH className="text-right">Qty</TH><TH className="text-right">Material</TH><TH className="text-right">Overhead</TH><TH className="text-right">Cost / unit</TH><TH>Date &amp; time</TH><TH className="text-right">Print</TH></TR></THead>
            <TBody>
              {data.map((b) => (
                <TR key={b.id}>
                  <TD className="font-medium">{b.batchNumber}</TD>
                  <TD>{b.product.name}</TD>
                  <TD className="text-right">{formatQty(b.quantityProduced, b.product.unit.decimalPlaces)} {b.product.unit.name}</TD>
                  <TD className="text-right">{formatINR(b.totalMaterialCost)}</TD>
                  <TD className="text-right text-muted-foreground">{Number(b.overheadCost) > 0 ? formatINR(b.overheadCost) : '—'}</TD>
                  <TD className="text-right font-semibold text-primary">{formatINR(b.costPerUnit)}/{b.product.unit.name.toLowerCase()}</TD>
                  <TD className="whitespace-nowrap">{format(new Date(b.productionDate), 'dd MMM yyyy, hh:mm a')}</TD>
                  <TD className="text-right"><BatchPrintButton batchId={b.id} /></TD>
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

/** Fetches a batch's ingredients on click and prints a batch label. */
function BatchPrintButton({ batchId }: { batchId: string }) {
  const [loading, setLoading] = useState(false);
  const doPrint = async () => {
    setLoading(true);
    try {
      const d = await fetchBatchDetail(batchId);
      printBatchLabel({
        batchNumber: d.batchNumber,
        productName: d.product.name,
        quantity: Number(d.quantityProduced),
        unit: d.product.unit.name,
        productionDate: d.productionDate,
        ingredients: d.items.map((it) => ({
          name: it.nameSnapshot ?? it.rawMaterial?.name ?? it.componentProduct?.name ?? 'Item',
          quantity: Number(it.quantityConsumed),
          unit: it.rawMaterial?.unit.name ?? it.componentProduct?.unit.name ?? '',
        })),
      });
    } catch (e) {
      toast.error(apiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button variant="ghost" size="icon" title="Print batch label" loading={loading} onClick={doPrint}>
      <Printer className="h-4 w-4" />
    </Button>
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
                <TD className={cn('text-right', low && 'font-semibold text-danger')}>{formatQty(s.quantity, s.product.unit.decimalPlaces)} {s.product.unit.name}</TD>
                <TD className="text-right">{formatQty(s.product.reorderLevel, s.product.unit.decimalPlaces)}</TD>
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
