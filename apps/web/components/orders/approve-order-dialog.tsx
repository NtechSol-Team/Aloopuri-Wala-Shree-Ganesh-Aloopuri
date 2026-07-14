'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { ReceiptText, FileX, Tag, Landmark } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useApproveOrder, type Order } from '@/hooks/useOrders';

interface Line {
  itemId: string;
  name: string;
  unit: string;
  requested: number;
  approved: number;
  price: number;
  taxPercent: number;
}

/**
 * The main owner's credit-approval screen. Approving raises the bill on credit and
 * confirms the order, so this is the last moment anything about the money can change —
 * hence quantities, prices and the GST flag are all editable here. (Online orders never
 * reach this dialog: they are already paid for, so their numbers are settled.)
 */
export function ApproveOrderDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const approve = useApproveOrder();
  const [isGstBill, setIsGstBill] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    if (!order) return;
    setIsGstBill(order.isGstBill);
    // Prices were snapshotted when the outlet placed the order (special price → catalog
    // price), which is exactly what they were quoted — so seed from the snapshot.
    setLines(order.items.map((i) => ({
      itemId: i.id,
      name: i.product.name,
      unit: i.product.unit,
      requested: Number(i.requestedQuantity),
      approved: Number(i.confirmedQuantity ?? i.requestedQuantity),
      price: Number(i.unitPriceSnapshot ?? i.product.basePrice),
      taxPercent: Number(i.product.taxPercent),
    })));
  }, [order]);

  const updateLine = (itemId: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)));

  const subTotal = lines.reduce((s, l) => s + l.approved * l.price, 0);
  const taxTotal = isGstBill ? lines.reduce((s, l) => s + (l.approved * l.price * l.taxPercent) / 100, 0) : 0;
  const grandTotal = subTotal + taxTotal;

  const submit = () => {
    if (!order) return;
    if (lines.some((l) => l.approved < 0 || l.price < 0)) { toast.error('Quantity and price cannot be negative'); return; }
    if (lines.every((l) => l.approved === 0)) { toast.error('Approve at least one item, or reject the order instead'); return; }

    approve.mutate(
      { id: order.id, isGstBill, items: lines.map((l) => ({ itemId: l.itemId, confirmedQuantity: l.approved, unitPrice: l.price })) },
      {
        onSuccess: () => { toast.success(`${order.orderNumber} approved — bill raised on credit`); onClose(); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Approve credit order {order?.orderNumber}
            {order?.outlet.pricingMode === 'SPECIAL' && (
              <Badge variant="info"><Tag className="mr-1 -ml-0.5 inline h-3 w-3" />Special pricing</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {order?.outlet.name} asked to buy on credit. Approving raises the bill (due in{' '}
            {order?.outlet.creditPeriodDays} days) and confirms the order.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <span className="text-caption font-medium text-muted-foreground">Bill type</span>
          <div className="flex overflow-hidden rounded-md border border-border">
            <button type="button" onClick={() => setIsGstBill(true)} className={cn('flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium', isGstBill ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>
              <ReceiptText className="h-3.5 w-3.5" /> With GST
            </button>
            <button type="button" onClick={() => setIsGstBill(false)} className={cn('flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium', !isGstBill ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>
              <FileX className="h-3.5 w-3.5" /> Without GST
            </button>
          </div>
        </div>

        <div className="max-h-[42vh] overflow-y-auto rounded-md border border-border scrollbar-thin">
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH className="text-right">Ordered</TH>
                <TH className="w-[110px] text-right">Approved qty</TH>
                <TH className="w-[110px] text-right">Price</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {lines.map((l) => (
                <TR key={l.itemId}>
                  <TD className="font-medium">{l.name}</TD>
                  <TD className="text-right text-muted-foreground">{l.requested} {l.unit}</TD>
                  <TD className="px-1.5 py-1.5">
                    <Input type="number" step="0.01" className="h-8 text-right" value={l.approved} onChange={(e) => updateLine(l.itemId, { approved: Number(e.target.value) })} />
                  </TD>
                  <TD className="px-1.5 py-1.5">
                    <Input type="number" step="0.01" className="h-8 text-right" value={l.price} onChange={(e) => updateLine(l.itemId, { price: Number(e.target.value) })} />
                  </TD>
                  <TD className="text-right font-semibold">{formatINR(l.approved * l.price)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>

        <div className="space-y-1 rounded-md border border-border bg-surface p-3">
          <div className="flex justify-between text-caption text-muted-foreground"><span>Sub-total</span><span>{formatINR(subTotal)}</span></div>
          {isGstBill && <div className="flex justify-between text-caption text-muted-foreground"><span>GST</span><span>{formatINR(taxTotal)}</span></div>}
          <div className="flex justify-between text-label font-semibold"><span>Bill total (on credit)</span><span>{formatINR(grandTotal)}</span></div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={approve.isPending}>
            <Landmark className="h-4 w-4" /> Approve &amp; Raise Bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
