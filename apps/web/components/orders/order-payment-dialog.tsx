'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { CreditCard, ShieldCheck, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { useAuthStore } from '@/store/auth.store';
import { useOrderPaymentIntent, useVerifyOrderPayment, amountDue, type Order } from '@/hooks/useOrders';

/**
 * Pay for an order online. Payment gates nothing — the outlet may settle up front,
 * while the order is still awaiting fulfilment, or any time after it's delivered
 * while the bill is outstanding. Paying early is banked as an advance and applied
 * to the bill the moment fulfilment raises it.
 *
 * A dismissed, failed or timed-out checkout changes nothing, so it can simply be
 * retried from the orders list.
 */
export function OrderPaymentDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const intent = useOrderPaymentIntent();
  const verify = useVerifyOrderPayment();
  const user = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);

  if (!order) return null;

  // Before fulfilment the whole order total is payable; after it, only whatever
  // the bill still has outstanding.
  const isAdvance = order.status === 'CONFIRMED';
  const due = isAdvance ? order.totals.grandTotal : amountDue(order);

  const payOnline = async () => {
    setBusy(true);
    try {
      const rzp = await intent.mutateAsync(order.id);
      const opened = await openRazorpayCheckout({
        order: rzp,
        description: `Order ${order.orderNumber}`,
        customerName: user?.name ?? order.outlet.name,
        customerEmail: user?.email,
        customerContact: user?.phone,
        onSuccess: (r) => {
          verify.mutate(
            {
              id: order.id,
              razorpayOrderId: r.razorpay_order_id,
              razorpayPaymentId: r.razorpay_payment_id,
              razorpaySignature: r.razorpay_signature,
            },
            {
              onSuccess: () => { toast.success('Payment received'); onClose(); },
              // The money left their account but we couldn't record it here; the
              // Razorpay webhook still banks it server-side, so say that rather
              // than implying the payment failed.
              onError: (e) => toast.error(`${apiErrorMessage(e)} — if the amount was debited, it will be recorded automatically in a moment.`, { duration: 8000 }),
            },
          );
          setBusy(false);
        },
        onDismiss: () => {
          setBusy(false);
          toast('Payment cancelled — nothing has changed.', { icon: '⚠️' });
        },
      });
      if (!opened) {
        setBusy(false);
        toast.error('Could not open the payment window. Check your connection and try again.');
      }
    } catch (e) {
      setBusy(false);
      toast.error(apiErrorMessage(e));
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pay for {order.orderNumber}</DialogTitle>
          <DialogDescription>
            {isAdvance
              ? 'This order is with the main branch for fulfilment. You can pay now, or wait and settle the bill once it’s delivered — either is fine.'
              : 'This order has been delivered. Settle the outstanding bill below.'}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-caption text-muted-foreground">{isAdvance ? 'Order total' : 'Outstanding'}</span>
            <span className="text-2xl font-extrabold">{formatINR(due)}</span>
          </div>
          <div className="mt-1 flex justify-between text-caption text-muted-foreground">
            <span>Sub-total {formatINR(order.totals.subTotal)}</span>
            <span>{order.isGstBill ? `GST ${formatINR(order.totals.taxTotal)}` : 'Without GST'}</span>
          </div>
        </div>

        <button
          type="button"
          disabled={busy || due <= 0}
          onClick={payOnline}
          className="flex w-full flex-col items-start gap-1.5 rounded-xl border-2 border-primary bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <CreditCard className="h-6 w-6 text-primary" />}
          <span className="text-label font-semibold">Pay Online</span>
          <span className="text-caption text-muted-foreground">UPI, card or net-banking.</span>
        </button>

        <p className="flex items-center justify-center gap-1.5 text-caption text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Payments are verified securely by Razorpay.
        </p>

        <Button variant="ghost" disabled={busy} onClick={onClose}>
          {isAdvance ? 'Pay later' : 'Close'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
