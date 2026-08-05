'use client';

import toast from 'react-hot-toast';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { useDeleteBill } from '@/hooks/useBilling';

export interface DeleteTarget {
  id: string;
  billNumber: string;
  grandTotal: string;
  amountPaid: string;
  outletName: string;
}

/**
 * Deleting a bill unwinds the whole sale behind it, so say so before it happens.
 * A bill with money already banked can't be deleted at all — that's a refund — and
 * this catches it up front rather than letting the server reject it after the click.
 */
export function DeleteBillDialog({ target, onClose }: { target: DeleteTarget | null; onClose: () => void }) {
  const del = useDeleteBill();
  if (!target) return null;

  const paid = Number(target.amountPaid);
  const hasPayment = paid > 0;

  const submit = () => {
    del.mutate(target.id, {
      onSuccess: () => {
        toast.success(`${target.billNumber} deleted — stock and accounts reversed`);
        onClose();
      },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {target.billNumber}?</DialogTitle>
          <DialogDescription>{target.outletName} · {formatINR(target.grandTotal)}</DialogDescription>
        </DialogHeader>

        {hasPayment ? (
          <div className="flex gap-2.5 rounded-lg border border-danger/40 bg-danger/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <p className="text-caption leading-relaxed">
              This bill already has <span className="font-semibold">{formatINR(paid)}</span> paid against it, so it
              can&apos;t be deleted — that would discard a real receipt. Refund the payment first, then delete.
            </p>
          </div>
        ) : (
          <div className="flex gap-2.5 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <p className="text-caption leading-relaxed">
              Deleting this bill will remove it from sales records, return the stock to the godown, cancel the
              order behind it, and reverse the related accounting and analytics entries. This can&apos;t be undone.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Keep bill</Button>
          <Button variant="danger" onClick={submit} loading={del.isPending} disabled={hasPayment}>
            <Trash2 className="h-4 w-4" /> Delete bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
