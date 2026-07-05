'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Printer, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/utils';
import { printReceipt, getAutoPrint, setAutoPrint } from '@/lib/receipt-print';
import type { PosTxn } from '@/hooks/usePos';

/**
 * Full-panel "sale complete" takeover: giant token for calling out the order,
 * change to return, print/reprint, and a fast path into the next sale.
 */
export function SuccessOverlay({ txn, cashierName, onDone }: { txn: PosTxn | null; cashierName?: string; onDone: () => void }) {
  const [autoPrint, setAuto] = useState(true);

  useEffect(() => { setAuto(getAutoPrint()); }, []);

  // Auto-print once per sale, and let Enter/Space/Esc jump to the next sale.
  useEffect(() => {
    if (!txn) return;
    if (getAutoPrint()) printReceipt(txn, { cashierName });
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); onDone(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txn?.id]);

  if (!txn) return null;
  const change = Number(txn.changeGiven ?? 0);

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-card/95 p-6 backdrop-blur-sm">
      <CheckCircle2 className="h-14 w-14 text-success" />
      <div className="text-center">
        <p className="text-body font-medium text-muted-foreground">{txn.receiptNumber} · {formatINR(txn.grandTotal)}</p>
        <p className="mt-3 text-caption font-bold uppercase tracking-widest text-muted-foreground">Token</p>
        <p className="text-[96px] font-black leading-none text-primary">#{txn.tokenNumber ?? '—'}</p>
      </div>

      {change > 0 && (
        <div className="rounded-xl bg-success/10 px-6 py-3 text-center">
          <p className="text-caption font-semibold uppercase text-success">Return change</p>
          <p className="text-3xl font-extrabold text-success">{formatINR(change)}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button variant="secondary" size="lg" onClick={() => printReceipt(txn, { cashierName })}>
          <Printer className="h-5 w-5" /> Print Receipt
        </Button>
        <Button size="lg" className="px-8" onClick={onDone}>
          <Plus className="h-5 w-5" /> New Sale <span className="ml-1 rounded bg-primary-foreground/20 px-1.5 text-caption">Enter</span>
        </Button>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-caption text-muted-foreground">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[hsl(var(--primary))]"
          checked={autoPrint}
          onChange={(e) => { setAuto(e.target.checked); setAutoPrint(e.target.checked); }}
        />
        Auto-print receipt after every sale
      </label>
    </div>
  );
}
