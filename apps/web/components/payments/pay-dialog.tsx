'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Banknote, CreditCard } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useRecordCash, useRazorpayOrder, useVerifyRazorpay } from '@/hooks/usePayments';
import { openRazorpayCheckout } from '@/lib/razorpay';

export interface PayTarget {
  id: string;
  billNumber: string;
  balanceDue: string;
  outletName: string;
}

export function PayDialog({ bill, onClose }: { bill: PayTarget | null; onClose: () => void }) {
  const open = !!bill;
  const role = useAuthStore((s) => s.user?.role);
  const userName = useAuthStore((s) => s.user?.name);
  const isAdmin = role === 'SUPER_ADMIN';
  const balance = Number(bill?.balanceDue ?? 0);

  const [amount, setAmount] = useState(0);
  const cash = useRecordCash();
  const createOrder = useRazorpayOrder();
  const verify = useVerifyRazorpay();
  const [onlineBusy, setOnlineBusy] = useState(false);

  useEffect(() => { if (bill) setAmount(Number(bill.balanceDue)); }, [bill]);

  if (!bill) return null;

  const payCash = () => {
    if (amount <= 0 || amount > balance) { toast.error(`Enter an amount up to ${formatINR(balance)}`); return; }
    cash.mutate({ billId: bill.id, amount }, {
      onSuccess: () => { toast.success('Cash payment recorded'); onClose(); },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  const payOnline = async () => {
    setOnlineBusy(true);
    try {
      const order = await createOrder.mutateAsync(bill.id);
      const opened = await openRazorpayCheckout({
        order,
        customerName: userName,
        onSuccess: (r) => {
          verify.mutate(
            { billId: bill.id, razorpayOrderId: r.razorpay_order_id, razorpayPaymentId: r.razorpay_payment_id, razorpaySignature: r.razorpay_signature },
            { onSuccess: () => { toast.success('Payment successful'); onClose(); }, onError: (e) => toast.error(apiErrorMessage(e)) },
          );
        },
        onDismiss: () => setOnlineBusy(false),
      });
      if (!opened) toast.error('Could not load the payment gateway');
    } catch (e) {
      toast.error(apiErrorMessage(e, 'Could not start payment'));
    } finally {
      setOnlineBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pay {bill.billNumber}</DialogTitle>
          <DialogDescription>{bill.outletName} · Balance due {formatINR(balance)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Button className="w-full" size="lg" loading={onlineBusy || createOrder.isPending || verify.isPending} onClick={payOnline}>
            <CreditCard className="h-4 w-4" /> Pay Online (UPI / Card / Net Banking)
          </Button>

          {isAdmin && (
            <>
              <div className="flex items-center gap-3 text-caption text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> or record cash <span className="h-px flex-1 bg-border" />
              </div>
              <div className="space-y-1.5">
                <Label>Cash amount received</Label>
                <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} max={balance} />
                <p className="text-caption text-muted-foreground">Partial payments are allowed.</p>
              </div>
              <Button variant="secondary" className="w-full" loading={cash.isPending} onClick={payCash}>
                <Banknote className="h-4 w-4" /> Record Cash Payment
              </Button>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
