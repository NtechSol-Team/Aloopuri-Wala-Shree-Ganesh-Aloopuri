'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Warehouse, Factory, AlertTriangle, Truck } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useDispatchOrder, type Order, type FulfillmentSource } from '@/hooks/useOrders';
import { useMainBranchInventory, useGodownInventory } from '@/hooks/useInventory';
import { printOrderPickList } from '@/lib/print';

/**
 * Dispatch: pick where the goods physically come from, then send them. Stock leaves
 * that location now (not at receipt), so the availability shown here is the number
 * that actually gets decremented — and a shortfall is caught here, by the person who
 * can do something about it, rather than by the outlet when they confirm receipt.
 */
export function DispatchOrderDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const dispatch = useDispatchOrder();
  const { data: mainStock } = useMainBranchInventory();
  const { data: godownStock } = useGodownInventory();
  const [source, setSource] = useState<FulfillmentSource>('MAIN_BRANCH');

  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    if (source === 'GODOWN') {
      for (const row of godownStock?.finishedGoods ?? []) map.set(row.product.id, Number(row.quantity));
    } else {
      for (const row of mainStock ?? []) map.set(row.product.id, Number(row.quantity));
    }
    return map;
  }, [source, mainStock, godownStock]);

  if (!order) return null;

  const lines = order.items.map((i) => ({
    productId: i.product.id,
    name: i.product.name,
    unit: i.product.unit,
    qty: Number(i.confirmedQuantity ?? i.requestedQuantity),
    price: Number(i.unitPriceSnapshot ?? i.product.basePrice),
  }));
  const anyShort = lines.some((l) => l.qty > (stockMap.get(l.productId) ?? 0));

  const submit = () => {
    dispatch.mutate(
      { id: order.id, fulfillmentSource: source },
      {
        onSuccess: () => {
          toast.success(`${order.orderNumber} dispatched — awaiting the outlet's receipt`);
          printOrderPickList(
            { orderNumber: order.orderNumber, outletName: order.outlet.name, fulfillmentSource: source, isGstBill: order.isGstBill },
            lines.map((l) => ({ name: l.name, unit: l.unit, approvedQty: l.qty, price: l.price })),
          );
          onClose();
        },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dispatch {order.orderNumber}</DialogTitle>
          <DialogDescription>
            {order.outlet.name} · Stock leaves the selected location now, and lands in the outlet when they confirm receipt.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <span className="text-caption font-medium text-muted-foreground">Fulfil from</span>
          <div className="flex overflow-hidden rounded-md border border-border">
            <button type="button" onClick={() => setSource('MAIN_BRANCH')} className={cn('flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium', source === 'MAIN_BRANCH' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>
              <Factory className="h-3.5 w-3.5" /> Main Branch
            </button>
            <button type="button" onClick={() => setSource('GODOWN')} className={cn('flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium', source === 'GODOWN' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>
              <Warehouse className="h-3.5 w-3.5" /> Godown
            </button>
          </div>
        </div>

        <div className="max-h-[40vh] overflow-y-auto rounded-md border border-border scrollbar-thin">
          <Table>
            <THead><TR><TH>Product</TH><TH className="text-right">To send</TH><TH className="text-right">Available</TH><TH className="text-right">Value</TH></TR></THead>
            <TBody>
              {lines.map((l) => {
                const available = stockMap.get(l.productId) ?? 0;
                const short = l.qty > available;
                return (
                  <TR key={l.productId}>
                    <TD className="font-medium">{l.name}</TD>
                    <TD className="text-right">{l.qty} {l.unit}</TD>
                    <TD className={cn('text-right', short ? 'font-semibold text-danger' : 'text-muted-foreground')}>
                      <span className="inline-flex items-center justify-end gap-1">{short && <AlertTriangle className="h-3.5 w-3.5" />}{available} {l.unit}</span>
                    </TD>
                    <TD className="text-right font-semibold">{formatINR(l.qty * l.price)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>

        {anyShort && (
          <p className="flex items-center gap-1.5 rounded-md bg-danger/10 px-3 py-2 text-caption font-medium text-danger">
            <AlertTriangle className="h-4 w-4" /> Not enough stock at this location — switch source or produce/transfer more first.
          </p>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={dispatch.isPending} disabled={anyShort}>
            <Truck className="h-4 w-4" /> Dispatch &amp; Print Pick List
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
