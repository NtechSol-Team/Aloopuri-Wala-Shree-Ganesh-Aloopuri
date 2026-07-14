'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/lib/api';
import { useCancelOrder, useRejectOrder, type Order } from '@/hooks/useOrders';

/**
 * Kills an order for good, with a reason the outlet can read on the cancelled order.
 * `mode` picks the endpoint: the main owner *rejects* a credit request, while an outlet
 * *cancels* its own order that it hasn't settled yet.
 */
export function RejectOrderDialog({ order, mode, onClose }: {
  order: Order | null;
  mode: 'reject' | 'cancel';
  onClose: () => void;
}) {
  const reject = useRejectOrder();
  const cancel = useCancelOrder();
  const [reason, setReason] = useState('');
  const isReject = mode === 'reject';
  const mutation = isReject ? reject : cancel;

  if (!order) return null;

  const submit = () => {
    mutation.mutate(
      { id: order.id, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(isReject ? `${order.orderNumber} rejected` : `${order.orderNumber} cancelled`);
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
          <DialogTitle>{isReject ? `Reject ${order.orderNumber}?` : `Cancel ${order.orderNumber}?`}</DialogTitle>
          <DialogDescription>
            {isReject
              ? `${order.outlet.name} will be notified and the order is cancelled for good — it cannot continue in the workflow.`
              : 'This order will be cancelled. You can then place a new one.'}
          </DialogDescription>
        </DialogHeader>

        <div>
          <Label htmlFor="reason">Reason {isReject ? '(shown to the outlet)' : '(optional)'}</Label>
          <Input
            id="reason"
            className="mt-1"
            placeholder={isReject ? 'e.g. Credit limit exceeded — please clear pending dues' : 'e.g. Ordered by mistake'}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Keep order</Button>
          <Button variant="danger" onClick={submit} loading={mutation.isPending}>
            <XCircle className="h-4 w-4" /> {isReject ? 'Reject Order' : 'Cancel Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
