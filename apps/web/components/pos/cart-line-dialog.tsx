'use client';

import { useEffect, useState } from 'react';
import { Delete } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn, formatINR } from '@/lib/utils';
import type { CartItem } from '@/store/pos-cart.store';

type Field = 'AMOUNT' | 'QTY' | 'DISCOUNT';

const FIELDS: Array<{ key: Field; label: string; short: string }> = [
  { key: 'AMOUNT', label: 'Edit Amount', short: 'Amount' },
  { key: 'QTY', label: 'Edit Quantity', short: 'Quantity' },
  { key: 'DISCOUNT', label: 'Edit Discount', short: 'Discount' },
];

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'];

/**
 * Tap-a-cart-line numpad — replaces the old inline qty/discount inputs.
 * "Amount" is a convenience: typing a target line total back-solves the line
 * discount (mrp × qty − amount) rather than being a separate stored field,
 * since only quantity and discount are real, server-recognised fields —
 * the backend always re-prices lines from the catalog mrp.
 */
export function CartLineDialog({
  item,
  onClose,
  onQty,
  onDiscount,
}: {
  item: CartItem | null;
  onClose: () => void;
  onQty: (productId: string, qty: number) => void;
  onDiscount: (productId: string, discount: number) => void;
}) {
  const [field, setField] = useState<Field>('QTY');
  const [buf, setBuf] = useState('');

  useEffect(() => {
    if (item) { setField('QTY'); setBuf(''); }
  }, [item?.menuItemId]);

  if (!item) return null;

  const amount = Math.max(0, item.mrp * item.quantity - item.discount);
  const current: Record<Field, number> = { AMOUNT: amount, QTY: item.quantity, DISCOUNT: item.discount };
  const activeLabel = FIELDS.find((f) => f.key === field)!.short;

  const press = (d: string) => {
    if (d === '.' && buf.includes('.')) return;
    setBuf((b) => (b + d).slice(0, 9));
  };
  const backspace = () => setBuf((b) => b.slice(0, -1));
  const pickField = (f: Field) => { setField(f); setBuf(''); };

  const commit = () => {
    const v = buf === '' ? current[field] : parseFloat(buf);
    if (Number.isNaN(v) || v < 0) { onClose(); return; }
    if (field === 'QTY') onQty(item.menuItemId, v);
    else if (field === 'DISCOUNT') onDiscount(item.menuItemId, v);
    else onDiscount(item.menuItemId, Math.max(0, item.mrp * item.quantity - v));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="truncate uppercase">{item.name}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-1.5">
          {FIELDS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => pickField(f.key)}
              className={cn(
                'rounded-md py-2 text-caption font-bold transition-colors',
                field === f.key ? 'bg-success text-white' : 'bg-surface text-muted-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1.5 text-center">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <p className="text-card-title font-bold">{f.key === 'QTY' ? current[f.key] : formatINR(current[f.key])}</p>
              <p className="text-caption text-muted-foreground">{f.short}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-lg bg-surface px-4 py-3">
          <span className="text-3xl font-bold tabular-nums">{buf || current[field]}</span>
          <button type="button" onClick={backspace} className="rounded-md p-2 text-muted-foreground hover:bg-card">
            <Delete className="h-5 w-5" />
          </button>
        </div>
        <p className="-mt-1 text-center text-caption text-muted-foreground">Enter {activeLabel}</p>

        <div className="grid grid-cols-3 gap-1.5">
          {KEYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => press(d)}
              className="rounded-md bg-surface py-3 text-xl font-bold transition-colors hover:bg-accent"
            >
              {d}
            </button>
          ))}
          <Button variant="success" className="text-lg font-bold" onClick={commit}>OK</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
