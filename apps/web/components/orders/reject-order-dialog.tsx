'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { XCircle, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { useCancelOrder, type Order } from '@/hooks/useOrders';

/**
 * Calls off an order before it ships, with a reason the outlet can read on the
 * cancelled order. Only available while an order is still awaiting fulfilment —
 * once fulfilled, stock has moved and a bill exists, so undoing it would be a
 * credit note rather than a cancellation.
 */
export function RejectOrderDialog({ order, onClose }: {
  order: Order | null;
  /** Kept so call sites reading `mode` still compile; cancelling is the only mode now. */
  mode?: 'cancel';
  onClose: () => void;
}) {
  const cancel = useCancelOrder();
  const [reason, setReason] = useState('');

  if (!order) return null;

  const submit = () => {
    cancel.mutate(
      { id: order.id, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`${order.orderNumber} cancelled`);
          setReason('');
          onClose();
        },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel {order.orderNumber}?</DialogTitle>
          <DialogDescription>
            {order.outlet.name} will see this order as cancelled, along with your reason. They can then place a new one.
          </DialogDescription>
        </DialogHeader>

        {/* Orders are billed at placement, so cancelling almost always unwinds a real
            sales document — spell out exactly what gets undone before they commit. */}
        {order.bill && (
          <div className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-caption leading-relaxed">
              This order has an associated Sales Bill (<span className="font-semibold">{order.bill.billNumber}</span>,{' '}
              {formatINR(order.bill.grandTotal)}). Cancelling this order will also delete the Sales Bill, restore the
              inventory stock, and reverse all related accounting and analytics entries. Do you want to continue?
            </p>
          </div>
        )}

        <div>
          <Label htmlFor="reason">Reason (shown to the outlet)</Label>
          <Input
            id="reason"
            className="mt-1"
            placeholder="e.g. Out of stock — please reorder next week"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Keep order</Button>
          <Button variant="danger" onClick={submit} loading={cancel.isPending}>
            <XCircle className="h-4 w-4" /> {order.bill ? "Cancel order & delete bill" : "Cancel Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
