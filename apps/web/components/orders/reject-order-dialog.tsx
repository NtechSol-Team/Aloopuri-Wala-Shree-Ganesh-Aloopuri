'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/lib/api';
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
            <XCircle className="h-4 w-4" /> Cancel Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
