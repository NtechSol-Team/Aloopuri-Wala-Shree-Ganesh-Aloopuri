'use client';

import toast from 'react-hot-toast';
import { AlertTriangle, Undo2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { useDeletePayment, type PaymentRow } from '@/hooks/usePayments';

/**
 * For a payment entered by mistake — wrong bill, wrong amount, double entry.
 * Reversing it puts the bill back exactly where it would be had this payment
 * never happened: its paid amount drops by this much, its balance due rises
 * by the same, and its status re-derives (fully paid can drop back to
 * partially paid, or all the way to unpaid) — all computed server-side from
 * what's actually left recorded against it, not just subtracted here.
 */
export function ReversePaymentDialog({ target, onClose }: { target: PaymentRow | null; onClose: () => void }) {
  const del = useDeletePayment();
  if (!target) return null;

  const billCount = target.allocations?.length ?? (target.bill ? 1 : 0);
  const isMultiBill = billCount > 1 || (target.splitAcrossBills && billCount !== 1);
  const isPureAdvance = billCount === 0 && Number(target.advanceAmount ?? 0) > 0;

  const submit = () => {
    del.mutate(target.id, {
      onSuccess: (res) => {
        const bills = res.data.bills as Array<{ billNumber: string; status: string }>;
        const summary = bills.length > 1
          ? `adjusted across ${bills.length} bills (${bills.map((b) => b.billNumber).join(', ')})`
          : bills[0]
            ? `${bills[0].billNumber} is now ${bills[0].status.replace('_', ' ').toLowerCase()}`
            : 'no bill needed adjusting';
        toast.success(`${target.paymentNumber} reversed — ${summary}`);
        onClose();
      },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reverse {target.paymentNumber}?</DialogTitle>
          <DialogDescription>{target.outlet.name} · {target.bill?.billNumber ?? '—'} · {formatINR(target.amount)}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-caption leading-relaxed">
            {isPureAdvance ? (
              <>This was recorded entirely as advance/credit for {target.outlet.name} — no bill to adjust, so reversing it just removes that credit.</>
            ) : isMultiBill ? (
              <>
                This receipt was split across {billCount} bills{target.allocations ? ` (${target.allocations.map((a) => a.bill.billNumber).join(', ')})` : ''}.
                Reversing it undoes <span className="font-semibold">every</span> one of those allocations — each bill's paid amount drops by its
                share and its status updates to match.
              </>
            ) : (
              <>
                {target.bill?.billNumber ?? 'The bill'}&apos;s paid amount goes down by{' '}
                <span className="font-semibold">{formatINR(target.allocatedAmount ?? target.amount)}</span> and its balance due goes up by the
                same — its status updates to match (back to Partially Paid, or all the way to Unpaid if this was the
                only payment on it).
              </>
            )}
            {' '}This only corrects the record here; it does not itself refund any real money
            {target.method === 'RAZORPAY' ? ' collected through Razorpay — do that separately if it applies' : ''}.
          </p>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Keep payment</Button>
          <Button variant="danger" onClick={submit} loading={del.isPending}>
            <Undo2 className="h-4 w-4" /> Reverse payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
