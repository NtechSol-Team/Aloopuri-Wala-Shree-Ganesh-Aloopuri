'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Banknote } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiErrorMessage } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useRecordCash } from '@/hooks/usePayments';
import { UpiQr } from '@/components/payments/upi-qr';

export interface PayTarget {
  id: string;
  billNumber: string;
  balanceDue: string;
  outletName: string;
}

type TakenBy = 'CASH' | 'UPI' | 'BANK_TRANSFER';
const TAKEN_BY_LABEL: Record<TakenBy, string> = {
  CASH: 'Cash',
  UPI: 'UPI (scanned the QR)',
  BANK_TRANSFER: 'Bank transfer',
};

/**
 * Settle a bill. The outlet pays against the shop's UPI QR (or hands over cash);
 * whoever can actually see the money arrive — owner or godown — records it here.
 * There's no gateway callback to do that automatically, which is why recording
 * stays gated to those roles rather than left to the paying outlet.
 */
export function PayDialog({ bill, onClose }: { bill: PayTarget | null; onClose: () => void }) {
  const open = !!bill;
  const role = useAuthStore((s) => s.user?.role);
  // Matches the backend's own gate on POST /payments/cash — godown now fulfils
  // orders too, so they're just as likely to be the one taking payment.
  const canRecord = role === 'SUPER_ADMIN' || role === 'GODOWN_MANAGER';
  const balance = Number(bill?.balanceDue ?? 0);

  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<TakenBy>('CASH');
  const [reference, setReference] = useState('');
  const cash = useRecordCash();

  useEffect(() => {
    if (bill) { setAmount(Number(bill.balanceDue)); setMethod('CASH'); setReference(''); }
  }, [bill]);

  if (!bill) return null;

  // Nothing here verified the transfer happened — this is only ever a note the
  // recorder chose to type against the bank statement, so it's optional even
  // for UPI/bank transfer, not something we can require and enforce.
  const record = () => {
    if (amount <= 0 || amount > balance) { toast.error(`Enter an amount up to ${formatINR(balance)}`); return; }
    cash.mutate({ billId: bill.id, amount, method, referenceNumber: reference.trim() || undefined }, {
      onSuccess: () => { toast.success('Payment recorded'); onClose(); },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay {bill.billNumber}</DialogTitle>
          <DialogDescription>{bill.outletName} · Balance due {formatINR(balance)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {balance > 0 && <UpiQr amount={balance} reference={bill.billNumber} outletName={bill.outletName} />}

          {canRecord ? (
            <>
              <div className="flex items-center gap-3 text-caption text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> record the payment <span className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-1.5">
                <Label>Received by</Label>
                <Select value={method} onChange={(e) => setMethod(e.target.value as TakenBy)}>
                  {(Object.keys(TAKEN_BY_LABEL) as TakenBy[]).map((m) => (
                    <option key={m} value={m}>{TAKEN_BY_LABEL[m]}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Amount received</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} max={balance} />
                <p className="text-caption text-muted-foreground">Partial payments are allowed.</p>
              </div>
              {method !== 'CASH' && (
                <div className="space-y-1.5">
                  <Label>Bank reference / UTR <span className="text-muted-foreground">(optional)</span></Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="From your bank's SMS or statement" />
                  <p className="text-caption text-muted-foreground">
                    Nothing here confirms the transfer — only check your own bank app or statement before recording.
                    This just makes it easy to match later.
                  </p>
                </div>
              )}
              <Button className="w-full" loading={cash.isPending} onClick={record}>
                <Banknote className="h-4 w-4" /> Record Payment
              </Button>
            </>
          ) : (
            <p className="text-center text-caption text-muted-foreground">
              After paying, the main branch will confirm receipt and update this bill.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
