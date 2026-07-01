'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Boxes, Tag, Sparkles, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useRawMaterials, useProducts } from '@/hooks/useProducts';
import { useExpenseCategories } from '@/hooks/useExpenses';
import { useRecordPurchase, type PurchaseItemInput } from '@/hooks/useProduction';
import { useGstLookup } from '@/hooks/useGst';

const METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD'];
const HOME_STATE = '24'; // Gujarat
const GST_RATES = [0, 5, 12, 18, 28];

type Line =
  | { kind: 'RAW_MATERIAL'; rawMaterialId: string; quantity: number; costPerUnit: number; taxRate: number; hsnCode: string }
  | { kind: 'FINISHED_GOOD'; productId: string; quantity: number; costPerUnit: number; taxRate: number; hsnCode: string }
  | { kind: 'OTHER'; categoryId: string; description: string; amount: number; taxRate: number; hsnCode: string };

export function PurchaseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: materials } = useRawMaterials();
  const { data: productsData } = useProducts();
  const { data: categories } = useExpenseCategories();
  const record = useRecordPurchase();
  const lookup = useGstLookup();
  const [supplierName, setSupplier] = useState('');
  const [supplierGstin, setGstin] = useState('');
  const [supplierState, setSupplierState] = useState('');
  const [invoiceNumber, setInvoice] = useState('');
  const [paymentMethod, setMethod] = useState('CASH');
  const [payMode, setPayMode] = useState<'full' | 'credit' | 'partial'>('full');
  const [customPaid, setCustomPaid] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);

  const rmList = materials?.rows ?? [];
  const prodList = productsData?.rows ?? [];
  const catList = categories ?? [];
  const newRawLine = (): Line => { const f = rmList[0]; return { kind: 'RAW_MATERIAL', rawMaterialId: f?.id ?? '', quantity: 1, costPerUnit: Number(f?.costPerUnit ?? 0), taxRate: 5, hsnCode: '' }; };
  const newFgLine = (): Line => { const f = prodList[0]; return { kind: 'FINISHED_GOOD', productId: f?.id ?? '', quantity: 1, costPerUnit: Number(f?.basePrice ?? 0), taxRate: Number(f?.taxPercent ?? 5), hsnCode: '' }; };
  const newOtherLine = (): Line => ({ kind: 'OTHER', categoryId: catList[0]?.id ?? '', description: '', amount: 0, taxRate: 18, hsnCode: '' });

  useEffect(() => {
    if (open) {
      setSupplier(''); setGstin(''); setSupplierState(''); setInvoice(''); setMethod('CASH'); setPayMode('full'); setCustomPaid(0);
      setLines(rmList.length ? [newRawLine()] : catList.length ? [newOtherLine()] : []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, materials, categories]);

  const update = (i: number, patch: Partial<Line>) => setLines((l) => l.map((row, idx) => (idx === i ? ({ ...row, ...patch } as Line) : row)));
  const setKind = (i: number, kind: Line['kind']) => setLines((l) => l.map((row, idx) => (idx === i ? (kind === 'RAW_MATERIAL' ? newRawLine() : kind === 'FINISHED_GOOD' ? newFgLine() : newOtherLine()) : row)));
  const onMaterial = (i: number, id: string) => { const m = rmList.find((r) => r.id === id); update(i, { rawMaterialId: id, costPerUnit: Number(m?.costPerUnit ?? 0) } as Partial<Line>); };
  const onProduct = (i: number, id: string) => { const p = prodList.find((x) => x.id === id); update(i, { productId: id, costPerUnit: Number(p?.basePrice ?? 0), taxRate: Number(p?.taxPercent ?? 5) } as Partial<Line>); };
  const remove = (i: number) => setLines((l) => l.filter((_, idx) => idx !== i));

  const lineBase = (l: Line) => (l.kind === 'OTHER' ? l.amount : l.quantity * l.costPerUnit);
  const lineTax = (l: Line) => Math.round(lineBase(l) * l.taxRate) / 100;
  const taxable = lines.reduce((s, l) => s + lineBase(l), 0);
  const taxTotal = lines.reduce((s, l) => s + lineTax(l), 0);
  const grand = taxable + taxTotal;
  const intraState = !supplierGstin || supplierGstin.slice(0, 2) === HOME_STATE;
  const cgst = intraState ? taxTotal / 2 : 0;
  const igst = intraState ? 0 : taxTotal;
  const paidNow = payMode === 'full' ? grand : payMode === 'credit' ? 0 : Math.min(Math.max(0, customPaid), grand);
  const balance = Math.max(0, grand - paidNow);

  const fetchGstin = () => {
    const g = supplierGstin.trim().toUpperCase();
    if (g.length !== 15) { toast.error('Enter a 15-character GSTIN'); return; }
    lookup.mutate(g, {
      onSuccess: (r) => {
        setGstin(r.gstin); setSupplierState(r.stateName ?? '');
        if (!supplierName && (r.tradeName || r.legalName)) setSupplier(r.tradeName || r.legalName || '');
        toast.success(r.source === 'gstzen' ? `Fetched · ${r.stateName ?? ''}` : `Valid GSTIN · ${r.stateName ?? ''}`);
      },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  const submit = () => {
    if (!lines.length) { toast.error('Add at least one line'); return; }
    for (const l of lines) {
      if (l.kind === 'RAW_MATERIAL' && (!l.rawMaterialId || l.quantity <= 0)) { toast.error('Fill all raw-material lines'); return; }
      if (l.kind === 'FINISHED_GOOD' && (!l.productId || l.quantity <= 0)) { toast.error('Fill all finished-good lines'); return; }
      if (l.kind === 'OTHER' && (!l.categoryId || l.amount <= 0)) { toast.error('Fill all other lines'); return; }
    }
    const items: PurchaseItemInput[] = lines.map((l) =>
      l.kind === 'RAW_MATERIAL'
        ? { kind: 'RAW_MATERIAL', rawMaterialId: l.rawMaterialId, quantity: l.quantity, costPerUnit: l.costPerUnit, taxRate: l.taxRate, hsnCode: l.hsnCode || undefined }
        : l.kind === 'FINISHED_GOOD'
          ? { kind: 'FINISHED_GOOD', productId: l.productId, quantity: l.quantity, costPerUnit: l.costPerUnit, taxRate: l.taxRate, hsnCode: l.hsnCode || undefined }
          : { kind: 'OTHER', categoryId: l.categoryId, description: l.description || undefined, amount: l.amount, taxRate: l.taxRate, hsnCode: l.hsnCode || undefined },
    );
    record.mutate(
      { supplierName: supplierName || undefined, supplierGstin: supplierGstin || undefined, invoiceNumber: invoiceNumber || undefined, paymentMethod, amountPaidNow: paidNow, items },
      {
        onSuccess: (r) => { toast.success(`Purchase ${r.billNumber} · ${formatINR(r.totalCost)} · ${r.status.replace('_', ' ').toLowerCase()}`); onOpenChange(false); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Record GST Purchase Bill</DialogTitle>
          <DialogDescription>Raw materials go to inventory (cost ex-GST); GST is captured as input tax credit. Other items book as expenses.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Supplier GSTIN</Label>
            <div className="flex gap-2">
              <Input value={supplierGstin} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="24ABCDE1234F1Z5" maxLength={15} />
              <Button type="button" variant="secondary" loading={lookup.isPending} onClick={fetchGstin}><Sparkles className="h-4 w-4" /></Button>
            </div>
            {supplierState && <p className="text-caption text-muted-foreground">{supplierState} · {intraState ? 'CGST+SGST' : 'IGST'}</p>}
          </div>
          <div className="space-y-1.5"><Label>Supplier name</Label><Input value={supplierName} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. APMC Surat" /></div>
          <div className="space-y-1.5"><Label>Invoice No.</Label><Input value={invoiceNumber} onChange={(e) => setInvoice(e.target.value)} placeholder="e.g. INV-1042" /></div>
        </div>

        <div className="max-h-[34vh] space-y-2 overflow-y-auto scrollbar-thin pr-1">
          <Label>Lines</Label>
          {lines.map((line, i) => (
            <div key={i} className="rounded-md border border-border p-2">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex overflow-hidden rounded-md border border-border">
                  <button type="button" onClick={() => setKind(i, 'RAW_MATERIAL')} className={cn('flex items-center gap-1 px-2.5 py-1 text-caption font-medium', line.kind === 'RAW_MATERIAL' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}><Boxes className="h-3.5 w-3.5" /> Raw</button>
                  <button type="button" onClick={() => setKind(i, 'FINISHED_GOOD')} className={cn('flex items-center gap-1 px-2.5 py-1 text-caption font-medium', line.kind === 'FINISHED_GOOD' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}><Package className="h-3.5 w-3.5" /> Finished Good</button>
                  <button type="button" onClick={() => setKind(i, 'OTHER')} className={cn('flex items-center gap-1 px-2.5 py-1 text-caption font-medium', line.kind === 'OTHER' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}><Tag className="h-3.5 w-3.5" /> Other</button>
                </div>
                <span className="ml-auto text-caption font-medium text-muted-foreground">{formatINR(lineBase(line) + lineTax(line))}</span>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(i)}><Trash2 className="h-4 w-4 text-danger" /></Button>
              </div>

              {line.kind === 'RAW_MATERIAL' ? (
                <div className="grid grid-cols-[1fr_70px_90px_84px_90px] gap-2">
                  <Select value={line.rawMaterialId} onChange={(e) => onMaterial(i, e.target.value)}>{rmList.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}</Select>
                  <Input type="number" step="0.01" placeholder="Qty" value={line.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) } as Partial<Line>)} />
                  <Input type="number" step="0.01" placeholder="Cost" value={line.costPerUnit} onChange={(e) => update(i, { costPerUnit: Number(e.target.value) } as Partial<Line>)} />
                  <Select value={line.taxRate} onChange={(e) => update(i, { taxRate: Number(e.target.value) } as Partial<Line>)}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</Select>
                  <Input placeholder="HSN" value={line.hsnCode} onChange={(e) => update(i, { hsnCode: e.target.value } as Partial<Line>)} />
                </div>
              ) : line.kind === 'FINISHED_GOOD' ? (
                <div className="grid grid-cols-[1fr_70px_90px_84px_90px] gap-2">
                  <Select value={line.productId} onChange={(e) => onProduct(i, e.target.value)}>{prodList.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</Select>
                  <Input type="number" step="0.01" placeholder="Qty" value={line.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) } as Partial<Line>)} />
                  <Input type="number" step="0.01" placeholder="Cost" value={line.costPerUnit} onChange={(e) => update(i, { costPerUnit: Number(e.target.value) } as Partial<Line>)} />
                  <Select value={line.taxRate} onChange={(e) => update(i, { taxRate: Number(e.target.value) } as Partial<Line>)}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</Select>
                  <Input placeholder="HSN" value={line.hsnCode} onChange={(e) => update(i, { hsnCode: e.target.value } as Partial<Line>)} />
                </div>
              ) : (
                <div className="grid grid-cols-[180px_1fr_84px_90px_90px] gap-2">
                  <Select value={line.categoryId} onChange={(e) => update(i, { categoryId: e.target.value } as Partial<Line>)}>{catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
                  <Input placeholder="Description" value={line.description} onChange={(e) => update(i, { description: e.target.value } as Partial<Line>)} />
                  <Select value={line.taxRate} onChange={(e) => update(i, { taxRate: Number(e.target.value) } as Partial<Line>)}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</Select>
                  <Input placeholder="HSN/SAC" value={line.hsnCode} onChange={(e) => update(i, { hsnCode: e.target.value } as Partial<Line>)} />
                  <Input type="number" step="0.01" placeholder="Amount" value={line.amount} onChange={(e) => update(i, { amount: Number(e.target.value) } as Partial<Line>)} />
                </div>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setLines((l) => [...l, newRawLine()])} disabled={rmList.length === 0}><Plus className="h-4 w-4" /> Raw material</Button>
            <Button variant="secondary" size="sm" onClick={() => setLines((l) => [...l, newFgLine()])} disabled={prodList.length === 0}><Plus className="h-4 w-4" /> Finished good</Button>
            <Button variant="secondary" size="sm" onClick={() => setLines((l) => [...l, newOtherLine()])} disabled={catList.length === 0}><Plus className="h-4 w-4" /> Other item</Button>
          </div>
        </div>

        {/* GST summary */}
        <div className="space-y-1 rounded-md border border-border bg-surface p-3 text-body">
          <Row label="Taxable value" value={formatINR(taxable)} />
          {intraState ? (
            <>
              <Row label="CGST" value={formatINR(cgst)} muted />
              <Row label="SGST" value={formatINR(taxTotal - cgst)} muted />
            </>
          ) : (
            <Row label="IGST" value={formatINR(igst)} muted />
          )}
          <Row label="Grand total" value={formatINR(grand)} bold />
        </div>

        {/* Payment */}
        <div className="rounded-md border border-border bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-border">
              {([['full', 'Pay full'], ['credit', 'On credit'], ['partial', 'Partial']] as const).map(([m, l]) => (
                <button key={m} type="button" onClick={() => setPayMode(m)} className={cn('px-3 py-1.5 text-caption font-medium', payMode === m ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>{l}</button>
              ))}
            </div>
            {payMode === 'partial' && <Input type="number" step="0.01" className="h-9 w-32" placeholder="Paid now" value={customPaid} onChange={(e) => setCustomPaid(Number(e.target.value))} />}
            <Select className="h-9 w-40" value={paymentMethod} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</Select>
            <div className="ml-auto text-right text-caption"><span className="text-success">Paying {formatINR(paidNow)}</span>{balance > 0 && <span className="ml-2 text-danger">Balance {formatINR(balance)}</span>}</div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={record.isPending}>Record Purchase</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold, muted }: { label: string; value: string; bold?: boolean; muted?: boolean }) {
  return <div className={cn('flex justify-between', bold && 'border-t border-border pt-1 font-semibold', muted && 'text-muted-foreground')}><span>{label}</span><span>{value}</span></div>;
}
