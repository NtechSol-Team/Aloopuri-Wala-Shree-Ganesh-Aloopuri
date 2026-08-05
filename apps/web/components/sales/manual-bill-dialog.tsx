'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Info } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiErrorMessage } from '@/lib/api';
import { formatINR, todayIso } from '@/lib/utils';
import { useOutlets } from '@/hooks/useOutlets';
import { useProducts } from '@/hooks/useProducts';
import { stepFor } from '@/hooks/useUnits';
import { useCreateManualBill } from '@/hooks/useBilling';

interface Line { productId: string; quantity: number; unitPrice: number }

/**
 * Back-entry of a sale that happened but never got recorded — a franchise forgot to
 * raise the bill, or it was missed at the time. Main owner only.
 *
 * The date is free (past dates are the whole point) and each line carries its own
 * price, so the owner can reproduce what was actually charged rather than whatever
 * the catalog says today. Saving produces the same order + bill pair a normal sale
 * does, so inventory, reports and the ledger all move exactly as they would have.
 */
export function ManualBillDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: outlets } = useOutlets();
  const { data: products } = useProducts({ isPosEnabled: false });
  const create = useCreateManualBill();

  const [outletId, setOutletId] = useState('');
  const [billDate, setBillDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  // Defaults on, matching what a real sale does. Off bills the goods without
  // touching inventory — for stock already accounted for some other way.
  const [deductStock, setDeductStock] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);

  const list = products?.rows ?? [];
  const activeOutlets = (outlets ?? []).filter((o) => o.isActive);

  useEffect(() => {
    if (!open) return;
    setOutletId(activeOutlets[0]?.id ?? '');
    setBillDate(todayIso());
    setNotes('');
    setDeductStock(true);
    setLines(list[0] ? [{ productId: list[0].id, quantity: 1, unitPrice: Number(list[0].mrp) }] : []);
    // Seeded once per open; re-running on every outlets/products tick would wipe edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const priceOf = (id: string) => Number(list.find((p) => p.id === id)?.mrp ?? 0);
  const unitOf = (id: string) => list.find((p) => p.id === id)?.unit;
  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  const add = () => list[0] && setLines((r) => [...r, { productId: list[0].id, quantity: 1, unitPrice: Number(list[0].mrp) }]);
  const update = (i: number, patch: Partial<Line>) => setLines((r) => r.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const remove = (i: number) => setLines((r) => r.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!outletId) { toast.error('Pick a franchise'); return; }
    if (!lines.length) { toast.error('Add at least one product'); return; }
    if (lines.some((l) => l.quantity <= 0)) { toast.error('Quantities must be greater than 0'); return; }
    create.mutate(
      { outletId, billDate, deductStock, notes: notes.trim() || undefined, items: lines },
      {
        onSuccess: () => {
          toast.success('Sales bill created');
          onOpenChange(false);
        },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Manual Sales Bill</DialogTitle>
          <DialogDescription>
            Record a sale that was missed or never entered. It behaves exactly like a normal sales bill —
            inventory, reports and accounting all update.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Franchise</Label>
            <Select value={outletId} onChange={(e) => setOutletId(e.target.value)}>
              {!activeOutlets.length && <option value="">No outlets</option>}
              {activeOutlets.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Bill date</Label>
            <Input type="date" value={billDate} max={todayIso()} onChange={(e) => setBillDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          {lines.map((line, i) => {
            const unit = unitOf(line.productId);
            return (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1 space-y-1">
                  {i === 0 && <Label className="text-caption">Product</Label>}
                  <Select value={line.productId} onChange={(e) => update(i, { productId: e.target.value, unitPrice: priceOf(e.target.value) })}>
                    {list.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </div>
                <div className="w-24 space-y-1">
                  {i === 0 && <Label className="text-caption">Qty{unit ? ` (${unit.name})` : ''}</Label>}
                  <Input
                    type="number"
                    step={stepFor(unit?.decimalPlaces ?? 0)}
                    value={line.quantity}
                    onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                  />
                </div>
                <div className="w-28 space-y-1">
                  {i === 0 && <Label className="text-caption">Rate (₹)</Label>}
                  <Input type="number" step="0.01" value={line.unitPrice} onChange={(e) => update(i, { unitPrice: Number(e.target.value) })} />
                </div>
                <div className="w-28 space-y-1 text-right">
                  {i === 0 && <Label className="text-caption">Amount</Label>}
                  <p className="py-2 text-body font-medium tabular-nums">{formatINR(line.quantity * line.unitPrice)}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4 text-danger" /></Button>
              </div>
            );
          })}
          <Button variant="secondary" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add item</Button>
        </div>

        <div className="space-y-1.5">
          <Label>Note <span className="text-muted-foreground">(optional)</span></Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. missed entry for 20 July" />
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4"
            checked={deductStock}
            onChange={(e) => setDeductStock(e.target.checked)}
          />
          <span>
            <span className="block text-body font-medium">Deduct Stock from Inventory</span>
            <span className="block text-caption text-muted-foreground">
              {deductStock
                ? 'The billed quantities come out of godown stock and land at the franchise, as a real sale would.'
                : 'The bill is raised on its own — inventory is left exactly as it is.'}
            </span>
          </span>
        </label>

        <div className="flex items-center justify-between border-t border-border pt-3">
          <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <Info className="h-3.5 w-3.5" /> GST follows the franchise&apos;s billing setting.
          </span>
          <span className="text-label font-semibold">Total (before GST) {formatINR(total)}</span>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending}>Create Bill</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
