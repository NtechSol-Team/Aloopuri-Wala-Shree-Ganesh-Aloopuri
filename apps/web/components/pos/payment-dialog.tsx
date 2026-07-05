'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Banknote, CreditCard, QrCode, SplitSquareHorizontal, X } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, formatINR } from '@/lib/utils';

export type PayMode = 'CASH' | 'CARD' | 'UPI' | 'SPLIT';

const MODES: Array<{ key: PayMode; label: string; icon: typeof Banknote }> = [
  { key: 'CASH', label: 'Cash', icon: Banknote },
  { key: 'UPI', label: 'UPI', icon: QrCode },
  { key: 'CARD', label: 'Card', icon: CreditCard },
  { key: 'SPLIT', label: 'Split', icon: SplitSquareHorizontal },
];

/** Sensible quick-tender amounts for Indian denominations. */
function quickAmounts(total: number): number[] {
  const ups = [10, 50, 100, 200, 500].map((d) => Math.ceil(total / d) * d);
  return [...new Set([Math.ceil(total), ...ups])].filter((v) => v >= total).slice(0, 5);
}

export function PaymentDialog({ open, onOpenChange, total, onComplete, busy }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  total: number;
  onComplete: (p: { paymentMode: PayMode; cashReceived?: number; split?: { cash: number; card: number; upi: number } }) => void;
  busy: boolean;
}) {
  const [mode, setMode] = useState<PayMode>('CASH');
  const [received, setReceived] = useState(0);
  const [split, setSplit] = useState({ cash: 0, card: 0, upi: 0 });
  const quicks = useMemo(() => quickAmounts(total), [total]);

  useEffect(() => {
    if (open) { setMode('CASH'); setReceived(Math.ceil(total)); setSplit({ cash: 0, card: 0, upi: total }); }
  }, [open, total]);

  const change = Math.max(0, received - total);
  const splitTotal = split.cash + split.card + split.upi;

  const submit = () => {
    if (mode === 'CASH' && received < total) { toast.error('Cash received is less than total'); return; }
    if (mode === 'SPLIT' && Math.abs(splitTotal - total) > 0.01) { toast.error('Split must equal the total'); return; }
    onComplete({ paymentMode: mode, cashReceived: mode === 'CASH' ? received : undefined, split: mode === 'SPLIT' ? split : undefined });
  };

  // Enter completes from anywhere in the dialog.
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter' && !busy) { e.preventDefault(); submit(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, received, split, busy, total]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-baseline justify-between">
            <span>Collect Payment</span>
            <span className="text-2xl font-extrabold text-primary">{formatINR(total)}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-2">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg border-2 py-3 text-body font-semibold transition-colors',
                mode === m.key ? 'border-primary bg-accent text-primary' : 'border-border text-muted-foreground hover:border-primary/40',
              )}
            >
              <m.icon className="h-5 w-5" />
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'CASH' && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {quicks.map((q) => (
                <button
                  key={q}
                  onClick={() => setReceived(q)}
                  className={cn(
                    'rounded-md border px-3.5 py-2 text-body font-bold transition-colors',
                    received === q ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50',
                  )}
                >
                  {q === Math.ceil(total) ? `Exact ${formatINR(q)}` : formatINR(q)}
                </button>
              ))}
            </div>
            <Input type="number" className="h-14 text-center text-2xl font-bold" value={received} onChange={(e) => setReceived(Number(e.target.value))} />
            <div className="flex items-center justify-between rounded-lg bg-success/10 px-4 py-3 text-card-title font-bold">
              <span className="text-success">Change to return</span>
              <span className="text-success">{formatINR(change)}</span>
            </div>
          </div>
        )}

        {mode === 'UPI' && (
          <p className="rounded-lg bg-surface p-4 text-center text-body text-muted-foreground">
            Ask the customer to scan the counter QR and confirm <b className="text-foreground">{formatINR(total)}</b> received.
          </p>
        )}
        {mode === 'CARD' && (
          <p className="rounded-lg bg-surface p-4 text-center text-body text-muted-foreground">
            Swipe/tap on the card machine for <b className="text-foreground">{formatINR(total)}</b>, then complete.
          </p>
        )}

        {mode === 'SPLIT' && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'card', 'upi'] as const).map((k) => (
                <div key={k} className="space-y-1">
                  <label className="text-caption font-semibold uppercase text-muted-foreground">{k}</label>
                  <Input type="number" className="text-right font-semibold" value={split[k]} onChange={(e) => setSplit({ ...split, [k]: Number(e.target.value) })} />
                </div>
              ))}
            </div>
            <p className={cn('text-right text-caption font-semibold', Math.abs(splitTotal - total) < 0.01 ? 'text-success' : 'text-danger')}>
              Split total {formatINR(splitTotal)} / {formatINR(total)}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}><X className="h-4 w-4" /> Cancel</Button>
          <Button className="h-12 flex-1 text-base" loading={busy} onClick={submit}>Complete Sale · {formatINR(total)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
