'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { formatINR } from '@/lib/utils';
import { UpiQr } from '@/components/payments/upi-qr';
import { amountDue, type Order } from '@/hooks/useOrders';

/**
 * Pay for an order by UPI. Payment gates nothing — the outlet may settle up front,
 * while the order is still awaiting fulfilment, or any time after it's delivered
 * while the bill is outstanding.
 *
 * This shows the shop's collection QR rather than running a gateway checkout, so
 * nothing here can confirm the transfer itself. The outlet pays from their own UPI
 * app and the main branch records it against the bill once the money lands — which
 * is deliberate: the side that can actually see the credit is the side that marks
 * it received.
 */
export function OrderPaymentDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
  if (!order) return null;

  // The bill is raised at placement, so it's the amount to settle whenever it exists —
  // and it's the only figure that accounts for anything already part-paid. Falling back
  // to the order total covers legacy orders that reach here still unbilled.
  const due = order.bill ? amountDue(order) : order.totals.grandTotal;
  const awaitingFulfilment = order.status === 'CONFIRMED';

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pay for {order.orderNumber}</DialogTitle>
          <DialogDescription>
            {awaitingFulfilment
              ? 'This order is with the main branch for fulfilment. You can pay now, or settle it any time before or after delivery — either is fine.'
              : 'This order has been delivered. Settle the outstanding bill below.'}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-caption text-muted-foreground">{order.bill ? 'Outstanding' : 'Order total'}</span>
            <span className="text-2xl font-extrabold">{formatINR(due)}</span>
          </div>
          <div className="mt-1 flex justify-between text-caption text-muted-foreground">
            <span>Sub-total {formatINR(order.totals.subTotal)}</span>
            <span>{order.isGstBill ? `GST ${formatINR(order.totals.taxTotal)}` : 'Without GST'}</span>
          </div>
        </div>

        {due > 0 ? (
          <>
            <UpiQr amount={due} reference={order.orderNumber} outletName={order.outlet.name} />
            <p className="text-center text-caption text-muted-foreground">
              After paying, the main branch will confirm receipt and update this order.
            </p>
          </>
        ) : (
          <p className="rounded-xl bg-surface p-4 text-center text-body text-muted-foreground">
            Nothing outstanding on this order.
          </p>
        )}

        <Button variant="ghost" onClick={onClose}>{awaitingFulfilment ? 'Pay later' : 'Close'}</Button>
      </DialogContent>
    </Dialog>
  );
}
