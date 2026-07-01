'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiErrorMessage } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { usePaySupplier } from '@/hooks/usePayables';

const METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD'];

// Minimal shape so this dialog works from both Payables and Purchases pages.
export interface SupplierBillRef {
  id: string;
  billNumber: string;
  supplierName: string | null;
  balanceDue: string;
}

export function PaySupplierDialog({ bill, onClose }: { bill: SupplierBillRef | null; onClose: () => void }) {
  const pay = usePaySupplier();
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState('BANK_TRANSFER');
  const balance = Number(bill?.balanceDue ?? 0);

  useEffect(() => { if (bill) { setAmount(Number(bill.balanceDue)); setMethod('BANK_TRANSFER'); } }, [bill]);
  if (!bill) return null;

  const submit = () => {
    if (amount <= 0 || amount > balance) { toast.error(`Enter an amount up to ${formatINR(balance)}`); return; }
    pay.mutate({ id: bill.id, amount, method }, {
      onSuccess: () => { toast.success('Supplier payment recorded'); onClose(); },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <Dialog open={!!bill} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pay {bill.billNumber}</DialogTitle>
          <DialogDescription>{bill.supplierName ?? 'Supplier'} · Balance {formatINR(balance)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>Amount</Label>
            <Input type="number" step="0.01" value={amount} max={balance} onChange={(e) => setAmount(Number(e.target.value))} />
            <p className="text-caption text-muted-foreground">Partial payments allowed.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Paid via</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={pay.isPending}>Record Payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
