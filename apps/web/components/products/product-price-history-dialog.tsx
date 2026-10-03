'use client';

import { format } from 'date-fns';
import { History, TrendingDown, TrendingUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR, ist } from '@/lib/utils';
import { useProductPriceHistory, type Product } from '@/hooks/useProducts';

/**
 * Every price this product has ever been set at, newest first — what it was
 * before each change and who changed it, so "why does this bill show ₹120 when
 * the catalog says ₹140 today" has an answer. Starts tracking from whenever
 * this feature shipped; a product untouched since then shows just its one
 * current price, same as a fresh one.
 */
export function ProductPriceHistoryDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const open = !!product;
  const history = useProductPriceHistory(product?.id ?? null);
  const rows = history.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{product?.name} — Price History</DialogTitle>
          <DialogDescription>Every base price and MRP change, most recent first.</DialogDescription>
        </DialogHeader>

        {history.isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <History className="h-7 w-7 text-muted-foreground" />
            <p className="text-body">
              Current price: <span className="font-semibold">{formatINR(product?.basePrice ?? 0)}</span> base ·{' '}
              <span className="font-semibold">{formatINR(product?.mrp ?? 0)}</span> MRP
            </p>
            <p className="text-caption text-muted-foreground">No price changes since price tracking started. The next change will appear here.</p>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto overflow-x-auto scrollbar-thin rounded-md border border-border">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH><TH className="text-right">Base Price</TH><TH className="text-right">MRP</TH><TH>Changed By</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r, i) => {
                  const prev = rows[i + 1];
                  const basePrice = Number(r.basePrice);
                  const trend = prev ? basePrice - Number(prev.basePrice) : 0;
                  return (
                    <TR key={r.id}>
                      <TD>{format(ist(r.changedAt), 'dd MMM yyyy, hh:mm a')}</TD>
                      <TD className="text-right font-medium tabular-nums">
                        <span className="inline-flex items-center justify-end gap-1">
                          {formatINR(basePrice)}
                          {trend > 0 && <TrendingUp className="h-3.5 w-3.5 text-danger" />}
                          {trend < 0 && <TrendingDown className="h-3.5 w-3.5 text-success" />}
                        </span>
                      </TD>
                      <TD className="text-right tabular-nums">{formatINR(r.mrp)}</TD>
                      <TD className={cn('text-caption', !r.changedByName && 'text-muted-foreground')}>{r.changedByName ?? '—'}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
