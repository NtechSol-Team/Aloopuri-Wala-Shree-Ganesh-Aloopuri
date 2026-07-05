'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Printer, Ban, ReceiptText } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { printReceipt } from '@/lib/receipt-print';
import { useSessionTransactions, useVoidTransaction, type PosTxn } from '@/hooks/usePos';

export function TxnsDrawer({ open, onOpenChange, sessionId, cashierName }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  cashierName?: string;
}) {
  const { data: txns, isLoading } = useSessionTransactions(open ? sessionId : null);
  const [voidTarget, setVoidTarget] = useState<PosTxn | null>(null);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Today&apos;s Sales</DialogTitle>
            <DialogDescription>Receipts in this session — reprint or void.</DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1 scrollbar-thin">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)
            ) : !txns?.length ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <ReceiptText className="h-8 w-8" />
                <p className="text-body">No sales yet in this session.</p>
              </div>
            ) : (
              txns.map((t) => (
                <div key={t.id} className={cn('flex items-center gap-3 rounded-lg border border-border p-3', t.status === 'VOID' && 'opacity-60')}>
                  <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-md bg-accent font-bold text-primary">
                    <span className="text-[10px] leading-none text-muted-foreground">TOKEN</span>
                    <span>#{t.tokenNumber ?? '—'}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{t.receiptNumber}</span>
                      {t.status === 'VOID'
                        ? <Badge variant="danger">Void</Badge>
                        : <Badge variant="neutral">{t.paymentMode}</Badge>}
                    </div>
                    <p className="truncate text-caption text-muted-foreground">
                      {format(new Date(t.soldAt), 'hh:mm a')} · {t.items.length} item{t.items.length === 1 ? '' : 's'}
                      {t.voidReason ? ` · ${t.voidReason}` : ''}
                    </p>
                  </div>
                  <span className="font-bold">{formatINR(t.grandTotal)}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" title="Print receipt" onClick={() => printReceipt(t, { cashierName })}>
                      <Printer className="h-4 w-4" />
                    </Button>
                    {t.status === 'COMPLETED' && (
                      <Button variant="ghost" size="icon" title="Void sale" onClick={() => setVoidTarget(t)}>
                        <Ban className="h-4 w-4 text-danger" />
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <VoidDialog txn={voidTarget} onClose={() => setVoidTarget(null)} />
    </>
  );
}

function VoidDialog({ txn, onClose }: { txn: PosTxn | null; onClose: () => void }) {
  const voidTxn = useVoidTransaction();
  const [reason, setReason] = useState('');

  const submit = () => {
    if (!txn) return;
    if (reason.trim().length < 2) { toast.error('Enter a reason for the void'); return; }
    voidTxn.mutate({ id: txn.id, reason: reason.trim() }, {
      onSuccess: () => { toast.success(`${txn.receiptNumber} voided — stock restored`); setReason(''); onClose(); },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <Dialog open={!!txn} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Void {txn?.receiptNumber}?</DialogTitle>
          <DialogDescription>
            {txn ? `${formatINR(txn.grandTotal)} will be reversed and stock restored. This cannot be undone.` : ''}
          </DialogDescription>
        </DialogHeader>
        <Input autoFocus placeholder="Reason (e.g. wrong items, customer cancelled)" value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={voidTxn.isPending} onClick={submit}><Ban className="h-4 w-4" /> Void Sale</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
