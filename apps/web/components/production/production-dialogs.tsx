'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Boxes, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiErrorMessage } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { useProducts, useRawMaterials, useBom, type BomItem } from '@/hooks/useProducts';
import { useLogBatch, useLogIntake } from '@/hooks/useProduction';

const OVERHEAD_PRESETS = ['Electricity', 'Gas', 'Labour', 'Packaging', 'Other'];

interface Overhead { label: string; amount: number }

interface IngredientRow {
  bomItemId: string;
  kind: 'RAW_MATERIAL' | 'PRODUCT';
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
}

function buildRow(b: BomItem, producedQty: number): IngredientRow {
  const isProduct = b.componentType === 'PRODUCT';
  return {
    bomItemId: b.id,
    kind: b.componentType,
    name: (isProduct ? b.componentProduct?.name : b.rawMaterial?.name) ?? '',
    unit: (isProduct ? b.componentProduct?.unit : b.rawMaterial?.unit) ?? '',
    quantity: Number(b.quantity) * producedQty,
    unitCost: isProduct ? Number(b.componentProduct?.avgCost ?? 0) : Number(b.rawMaterial?.costPerUnit ?? 0),
  };
}

export function LogBatchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: products } = useProducts();
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [notes, setNotes] = useState('');
  const [overheads, setOverheads] = useState<Overhead[]>([]);
  const [rows, setRows] = useState<IngredientRow[]>([]);
  const touchedQty = useRef<Set<string>>(new Set());
  const { data: bom } = useBom(productId || null);
  const log = useLogBatch();

  useEffect(() => {
    if (open && products?.rows.length && !productId) setProductId(products.rows[0].id);
    if (!open) { setOverheads([]); setNotes(''); }
  }, [open, products, productId]);

  // Recipe (re)loaded — e.g. product changed. Fresh rows, clear manual-edit tracking.
  useEffect(() => {
    touchedQty.current = new Set();
    setRows(bom ? bom.map((b) => buildRow(b, quantity)) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bom]);

  // Produced quantity changed — rescale only the rows the user hasn't hand-edited.
  useEffect(() => {
    setRows((rs) => rs.map((r) => {
      if (touchedQty.current.has(r.bomItemId)) return r;
      const b = bom?.find((x) => x.id === r.bomItemId);
      return b ? { ...r, quantity: Number(b.quantity) * quantity } : r;
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantity]);

  const setRowQuantity = (bomItemId: string, v: number) => {
    touchedQty.current.add(bomItemId);
    setRows((rs) => rs.map((r) => (r.bomItemId === bomItemId ? { ...r, quantity: v } : r)));
  };
  const setRowCost = (bomItemId: string, v: number) => setRows((rs) => rs.map((r) => (r.bomItemId === bomItemId ? { ...r, unitCost: v } : r)));

  const materialCost = rows.reduce((s, r) => s + r.quantity * r.unitCost, 0);
  const overheadTotal = overheads.reduce((s, o) => s + (Number.isFinite(o.amount) ? o.amount : 0), 0);
  const totalCost = materialCost + overheadTotal;
  const perUnit = quantity > 0 ? totalCost / quantity : 0;

  const addOverhead = () => setOverheads((o) => [...o, { label: OVERHEAD_PRESETS[0], amount: 0 }]);
  const updOverhead = (i: number, patch: Partial<Overhead>) => setOverheads((o) => o.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const rmOverhead = (i: number) => setOverheads((o) => o.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!productId || quantity <= 0) return;
    const cleanOverheads = overheads.filter((o) => o.label.trim() && o.amount > 0);
    const ingredients = rows.map((r) => ({ bomItemId: r.bomItemId, quantity: r.quantity, unitCost: r.unitCost }));
    log.mutate(
      {
        productId, quantityProduced: quantity, notes: notes || undefined,
        overheads: cleanOverheads.length ? cleanOverheads : undefined,
        ingredients: ingredients.length ? ingredients : undefined,
      },
      {
        onSuccess: (b) => { toast.success(`Batch ${b.batchNumber} · ${formatINR(b.costPerUnit)}/${b.product.unit.toLowerCase()}`); onOpenChange(false); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  const unitLabel = products?.rows.find((p) => p.id === productId)?.unit.toLowerCase() ?? 'unit';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Log Production Batch</DialogTitle>
          <DialogDescription>Ingredients (raw materials + product components) auto-deduct from the godown. Add overheads to get the true per-unit cost.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Select value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products?.rows.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quantity Produced</Label>
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
            </div>
          </div>

          <div className="rounded-md border border-border bg-surface p-3">
            <p className="mb-2 text-caption font-semibold uppercase text-muted-foreground">
              Ingredients required <span className="font-normal normal-case">(qty &amp; price editable — actual usage/cost can differ from the recipe)</span>
            </p>
            {rows.length > 0 ? (
              <div className="-mx-1 overflow-x-auto px-1 scrollbar-thin">
                <div className="min-w-[420px] space-y-2">
                  <div className="grid grid-cols-[1fr_84px_92px_84px] gap-2 text-caption font-medium text-muted-foreground">
                    <span>Ingredient</span><span className="text-right">Qty</span><span className="text-right">Unit cost</span><span className="text-right">Line total</span>
                  </div>
                  {rows.map((r) => {
                    const Icon = r.kind === 'PRODUCT' ? Package : Boxes;
                    return (
                      <div key={r.bomItemId} className="grid grid-cols-[1fr_84px_92px_84px] items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 truncate text-body"><Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{r.name}</span>
                        <Input type="number" step="0.01" className="h-8 text-right" value={r.quantity} onChange={(e) => setRowQuantity(r.bomItemId, Number(e.target.value))} />
                        <Input type="number" step="0.01" className="h-8 text-right" value={r.unitCost} onChange={(e) => setRowCost(r.bomItemId, Number(e.target.value))} />
                        <span className="text-right text-body font-medium">{formatINR(r.quantity * r.unitCost)}</span>
                      </div>
                    );
                  })}
                  <div className="flex justify-between border-t border-border pt-1.5 text-body font-semibold">
                    <span>Material cost</span><span>{formatINR(materialCost)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-body text-muted-foreground">No recipe defined — no ingredients will be deducted.</p>
            )}
          </div>

          <div className="rounded-md border border-border bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-caption font-semibold uppercase text-muted-foreground">Overheads <span className="font-normal normal-case">(costing only — no expense entry)</span></p>
              <Button variant="ghost" size="sm" onClick={addOverhead}><Plus className="h-4 w-4" /> Add</Button>
            </div>
            {overheads.length === 0 ? (
              <p className="text-caption text-muted-foreground">Add electricity, gas, labour, etc. to capture the real cost.</p>
            ) : (
              <div className="space-y-2">
                {overheads.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select className="h-9 flex-1" value={OVERHEAD_PRESETS.includes(o.label) ? o.label : 'Other'} onChange={(e) => updOverhead(i, { label: e.target.value })}>
                      {OVERHEAD_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </Select>
                    <Input type="number" step="0.01" className="h-9 w-32 text-right" placeholder="Amount" value={o.amount} onChange={(e) => updOverhead(i, { amount: Number(e.target.value) })} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => rmOverhead(i)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>

          <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-3 text-body">
            <div className="flex justify-between text-muted-foreground"><span>Material</span><span>{formatINR(materialCost)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Overhead</span><span>{formatINR(overheadTotal)}</span></div>
            <div className="flex justify-between border-t border-border pt-1 font-semibold"><span>Total cost</span><span>{formatINR(totalCost)}</span></div>
            <div className="flex justify-between text-card-title font-bold text-primary"><span>Cost per {unitLabel}</span><span>{formatINR(perUnit)}</span></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={log.isPending}>Log Batch</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LogIntakeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: materials } = useRawMaterials();
  const [rawMaterialId, setRawMaterialId] = useState('');
  const [quantity, setQuantity] = useState(10);
  const [costPerUnit, setCostPerUnit] = useState(0);
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const log = useLogIntake();

  useEffect(() => {
    if (open && materials?.rows.length && !rawMaterialId) {
      const first = materials.rows[0];
      setRawMaterialId(first.id);
      setCostPerUnit(Number(first.costPerUnit));
    }
  }, [open, materials, rawMaterialId]);

  const onSelect = (id: string) => {
    setRawMaterialId(id);
    const m = materials?.rows.find((r) => r.id === id);
    if (m) setCostPerUnit(Number(m.costPerUnit));
  };

  const submit = () => {
    if (!rawMaterialId || quantity <= 0) return;
    log.mutate(
      { rawMaterialId, quantity, costPerUnit, supplierName: supplierName || undefined, invoiceNumber: invoiceNumber || undefined },
      {
        onSuccess: () => { toast.success('Intake logged & stock updated'); onOpenChange(false); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Raw Material Intake</DialogTitle>
          <DialogDescription>Increases stock and recomputes the weighted-average cost.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Raw Material</Label>
            <Select value={rawMaterialId} onChange={(e) => onSelect(e.target.value)}>
              {materials?.rows.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input type="number" step="0.01" value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Cost / Unit (₹)</Label>
            <Input type="number" step="0.01" value={costPerUnit} onChange={(e) => setCostPerUnit(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <Input value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label>Invoice No.</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Optional" />
          </div>
          <p className="sm:col-span-2 text-caption text-muted-foreground">Total: {formatINR(quantity * costPerUnit)}</p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={log.isPending}>Log Intake</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
