'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Printer, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/utils';
import { printReceipt, getAutoPrint, setAutoPrint } from '@/lib/print';
import { useStoreProfile } from '@/hooks/useOutlets';
import { useAuthStore } from '@/store/auth.store';
import type { PosTxn } from '@/hooks/usePos';

/**
 * Full-panel "sale complete" takeover: giant token for calling out the order,
 * change to return, auto-print, and an automatic jump into the next sale —
 * the cashier never has to click anything between sales.
 */
export function SuccessOverlay({ txn, cashierName, onDone }: { txn: PosTxn | null; cashierName?: string; onDone: () => void }) {
  // Receipts carry this outlet's own name/address/GSTIN, not the parent company's.
  const store = useStoreProfile();
  const outletId = useAuthStore((s) => s.user?.outletId);
  const [autoPrint, setAuto] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  // Auto-print must fire exactly once per sale, even though the effect below also
  // re-runs when the outlet profile arrives.
  const printedFor = useRef<string | null>(null);

  useEffect(() => { setAuto(getAutoPrint()); }, []);

  // Per sale: fire the receipt print immediately, then count down into the next
  // sale automatically (longer when change is due, so the cashier can read it).
  // Enter/Space/Esc or a tap anywhere skips straight to the next sale.
  useEffect(() => {
    if (!txn) { setSecondsLeft(null); return; }

    // A till that belongs to an outlet waits for that outlet's details before
    // printing — otherwise the first receipt after a page load would go out
    // carrying the company's identity instead of the shop's.
    const storeReady = !outletId || !!store;
    if (getAutoPrint() && storeReady && printedFor.current !== txn.id) {
      printedFor.current = txn.id;
      printReceipt(txn, { cashierName, store });
    }

    setSecondsLeft(Number(txn.changeGiven ?? 0) > 0 ? 6 : 3);
    const iv = setInterval(() => setSecondsLeft((s) => (s == null ? null : s - 1)), 1000);
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); onDone(); }
    };
    window.addEventListener('keydown', h);
    return () => { clearInterval(iv); window.removeEventListener('keydown', h); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txn?.id, store]);

  // Countdown finished → start the next sale on its own.
  useEffect(() => {
    if (secondsLeft === 0) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  if (!txn) return null;
  const change = Number(txn.changeGiven ?? 0);

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-card/95 p-6 backdrop-blur-sm"
      onClick={onDone}
    >
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

      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Button variant="secondary" size="lg" onClick={() => printReceipt(txn, { cashierName, store })}>
          <Printer className="h-5 w-5" /> Reprint
        </Button>
        <Button size="lg" className="px-8" onClick={onDone}>
          <Plus className="h-5 w-5" /> New Sale
          {secondsLeft != null && secondsLeft > 0 && (
            <span className="ml-1 rounded bg-primary-foreground/20 px-1.5 text-caption tabular-nums">auto · {secondsLeft}s</span>
          )}
        </Button>
      </div>
      <p className="text-caption text-muted-foreground">Starts the next sale automatically — or tap anywhere / press Enter.</p>

      <label
        className="flex cursor-pointer items-center gap-2 text-caption text-muted-foreground"
        onClick={(e) => e.stopPropagation()}
      >
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
