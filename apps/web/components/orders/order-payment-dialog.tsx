'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { CreditCard, Landmark, ShieldCheck, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { openRazorpayCheckout } from '@/lib/razorpay';
import { useOrderPaymentIntent, useRequestCredit, useVerifyOrderPayment, type Order } from '@/hooks/useOrders';

/**
 * How the outlet settles a freshly-placed (or still unpaid) order. Nothing is
 * confirmed until one of these completes: paying online verifies the signature
 * server-side and confirms the order, while credit sends it to the main owner.
 *
 * A dismissed, failed or timed-out checkout deliberately leaves the order in
 * Payment Pending so it can simply be retried from the orders list.
 */
export function OrderPaymentDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const intent = useOrderPaymentIntent();
  const verify = useVerifyOrderPayment();
  const credit = useRequestCredit();
  const [busy, setBusy] = useState<'online' | 'credit' | null>(null);

  if (!order) return null;
  const total = order.totals.grandTotal;

  const payOnline = async () => {
    setBusy('online');
    try {
      const rzp = await intent.mutateAsync(order.id);
      const opened = await openRazorpayCheckout({
        order: rzp,
        description: `Order ${order.orderNumber}`,
        customerName: order.outlet.name,
        onSuccess: (r) => {
          verify.mutate(
            {
              id: order.id,
              razorpayOrderId: r.razorpay_order_id,
              razorpayPaymentId: r.razorpay_payment_id,
              razorpaySignature: r.razorpay_signature,
            },
            {
              onSuccess: () => { toast.success('Payment successful — order confirmed'); onClose(); },
              // The money left their account but we couldn't confirm it here; the
              // Razorpay webhook still confirms the order server-side, so say so
              // instead of implying the payment failed.
              onError: (e) => toast.error(`${apiErrorMessage(e)} — if the amount was debited, the order will confirm automatically in a moment.`, { duration: 8000 }),
            },
          );
          setBusy(null);
        },
        onDismiss: () => {
          setBusy(null);
          toast('Payment cancelled — the order is still awaiting payment.', { icon: '⚠️' });
        },
      });
      if (!opened) {
        setBusy(null);
        toast.error('Could not open the payment window. Check your connection and try again.');
      }
    } catch (e) {
      setBusy(null);
      toast.error(apiErrorMessage(e));
    }
  };

  const payOnCredit = () => {
    setBusy('credit');
    credit.mutate(order.id, {
      onSuccess: () => { toast.success('Sent to the main owner for credit approval'); onClose(); },
      onError: (e) => toast.error(apiErrorMessage(e)),
      onSettled: () => setBusy(null),
    });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Complete your order</DialogTitle>
          <DialogDescription>
            Order {order.orderNumber} is placed but <strong>not confirmed yet</strong>. Pay online to confirm it
            instantly, or request credit and wait for the main owner&apos;s approval.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-caption text-muted-foreground">Amount payable</span>
            <span className="text-2xl font-extrabold">{formatINR(total)}</span>
          </div>
          <div className="mt-1 flex justify-between text-caption text-muted-foreground">
            <span>Sub-total {formatINR(order.totals.subTotal)}</span>
            <span>{order.isGstBill ? `GST ${formatINR(order.totals.taxTotal)}` : 'Without GST'}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <PayOption
            icon={CreditCard}
            title="Pay Online"
            subtitle="UPI, card or net-banking. Order is confirmed the moment payment succeeds."
            accent
            loading={busy === 'online'}
            disabled={!!busy}
            onClick={payOnline}
          />
          <PayOption
            icon={Landmark}
            title="On Credit"
            subtitle={`Pay within ${order.outlet.creditPeriodDays} days. Needs the main owner's approval first.`}
            loading={busy === 'credit'}
            disabled={!!busy}
            onClick={payOnCredit}
          />
        </div>

        <p className="flex items-center justify-center gap-1.5 text-caption text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" /> Payments are verified securely by Razorpay.
        </p>

        <Button variant="ghost" disabled={!!busy} onClick={onClose}>
          Decide later
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function PayOption({ icon: Icon, title, subtitle, accent, loading, disabled, onClick }: {
  icon: typeof CreditCard;
  title: string;
  subtitle: string;
  accent?: boolean;
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex flex-col items-start gap-1.5 rounded-xl border-2 p-4 text-left transition-colors disabled:opacity-60',
        accent ? 'border-primary bg-primary/5 hover:bg-primary/10' : 'border-border hover:bg-surface',
      )}
    >
      {loading ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Icon className={cn('h-6 w-6', accent ? 'text-primary' : 'text-muted-foreground')} />}
      <span className="text-label font-semibold">{title}</span>
      <span className="text-caption text-muted-foreground">{subtitle}</span>
    </button>
  );
}
