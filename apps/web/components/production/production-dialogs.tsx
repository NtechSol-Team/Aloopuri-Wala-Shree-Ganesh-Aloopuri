'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiErrorMessage } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { useProducts, useRawMaterials, useBom } from '@/hooks/useProducts';
import { useLogBatch, useLogIntake } from '@/hooks/useProduction';

export function LogBatchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: products } = useProducts();
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(100);
  const [notes, setNotes] = useState('');
  const { data: bom } = useBom(productId || null);
  const log = useLogBatch();

  useEffect(() => {
    if (open && products?.rows.length && !productId) setProductId(products.rows[0].id);
  }, [open, products, productId]);

  const estCost = useMemo(
    () => (bom ?? []).reduce((s, b) => s + Number(b.quantity) * quantity * Number(b.rawMaterial.costPerUnit), 0),
    [bom, quantity],
  );

  const submit = () => {
    if (!productId || quantity <= 0) return;
    log.mutate(
      { productId, quantityProduced: quantity, notes: notes || undefined },
      {
        onSuccess: () => { toast.success('Batch logged & raw materials deducted'); onOpenChange(false); setNotes(''); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Production Batch</DialogTitle>
          <DialogDescription>Raw materials are auto-deducted from the godown using the product BOM.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
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
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>

          <div className="rounded-md border border-border bg-surface p-3">
            <p className="mb-2 text-caption font-semibold uppercase text-muted-foreground">Materials required</p>
            {bom && bom.length > 0 ? (
              <ul className="space-y-1 text-body">
                {bom.map((b) => (
                  <li key={b.id} className="flex justify-between">
                    <span>{b.rawMaterial.name}</span>
                    <span className="text-muted-foreground">{(Number(b.quantity) * quantity).toFixed(2)} {b.rawMaterial.unit}</span>
                  </li>
                ))}
                <li className="flex justify-between border-t border-border pt-1 font-semibold">
                  <span>Estimated material cost</span><span>{formatINR(estCost)}</span>
                </li>
              </ul>
            ) : (
              <p className="text-body text-muted-foreground">No BOM defined — no materials will be deducted.</p>
            )}
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
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
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
          <p className="col-span-2 text-caption text-muted-foreground">Total: {formatINR(quantity * costPerUnit)}</p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={log.isPending}>Log Intake</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
