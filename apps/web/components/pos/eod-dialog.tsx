'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useCloseSession, useSessionSummary } from '@/hooks/usePos';

export function EodDialog({ open, onOpenChange, sessionId }: { open: boolean; onOpenChange: (v: boolean) => void; sessionId: string }) {
  const { data: summary } = useSessionSummary(open ? sessionId : null);
  const close = useCloseSession();
  const [closingCash, setClosingCash] = useState(0);

  const expectedCash = summary ? summary.openingCash + summary.cashCollected : 0;
  const variance = closingCash - expectedCash;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>End of Day Summary</DialogTitle></DialogHeader>
        {!summary ? <Skeleton className="h-48" /> : (
          <div className="space-y-1 text-body">
            <Row label="Transactions" value={String(summary.transactionCount)} />
            <Row label="Total sales" value={formatINR(summary.totalSales)} />
            <Row label="Cash collected" value={formatINR(summary.cashCollected)} />
            <Row label="Card collected" value={formatINR(summary.cardCollected)} />
            <Row label="UPI collected" value={formatINR(summary.upiCollected)} />
            <Row label="Voids" value={String(summary.voidCount)} />
            <div className="my-2 border-t border-border" />
            <Row label="Opening cash" value={formatINR(summary.openingCash)} />
            <Row label="Expected cash in drawer" value={formatINR(expectedCash)} />
            <div className="pt-2">
              <label className="text-caption font-medium">Counted closing cash</label>
              <Input type="number" className="mt-1" value={closingCash} onChange={(e) => setClosingCash(Number(e.target.value))} />
            </div>
            {closingCash > 0 && (
              <div className={cn('mt-1 flex justify-between rounded-md px-3 py-2 font-semibold', Math.abs(variance) < 1 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger')}>
                <span>{Math.abs(variance) < 1 ? 'Drawer matches' : variance > 0 ? 'Excess cash' : 'Cash short'}</span>
                <span>{formatINR(Math.abs(variance))}</span>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Keep Open</Button>
          <Button
            variant="danger"
            loading={close.isPending}
            onClick={() => close.mutate({ id: sessionId, closingCash }, {
              onSuccess: () => { toast.success('Session closed'); onOpenChange(false); },
              onError: (e) => toast.error(apiErrorMessage(e)),
            })}
          >
            Close Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}
