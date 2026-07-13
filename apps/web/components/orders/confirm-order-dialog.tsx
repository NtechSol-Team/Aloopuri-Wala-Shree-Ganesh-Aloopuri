'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Warehouse, Factory, AlertTriangle, ReceiptText, FileX, Tag } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useConfirmOrder, type Order, type FulfillmentSource } from '@/hooks/useOrders';
import { useMainBranchInventory, useGodownInventory } from '@/hooks/useInventory';
import { useOutletPrices } from '@/hooks/useOutlets';
import { printOrderPickList } from '@/lib/print';

interface Line {
  itemId: string;
  productId: string;
  name: string;
  unit: string;
  requested: number;
  approved: number;
  price: number;
  special: boolean;
}

export function ConfirmOrderDialog({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const confirm = useConfirmOrder();
  const { data: mainStock } = useMainBranchInventory();
  const { data: godownStock } = useGodownInventory();
  const isSpecialPricing = order?.outlet.pricingMode === 'SPECIAL';
  const { data: specialRows } = useOutletPrices(isSpecialPricing ? order!.outlet.id : null);
  const [source, setSource] = useState<FulfillmentSource>('MAIN_BRANCH');
  const [isGstBill, setIsGstBill] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    if (!order) return;
    if (isSpecialPricing && specialRows === undefined) return; // wait for special prices before seeding, so we don't default to catalog price then jump
    const specialMap = new Map((specialRows ?? []).map((r) => [r.id, r.specialPrice]));
    setSource('MAIN_BRANCH');
    setIsGstBill(true);
    setLines(order.items.map((i) => {
      const special = specialMap.get(i.product.id);
      return {
        itemId: i.id,
        productId: i.product.id,
        name: i.product.name,
        unit: i.product.unit,
        requested: Number(i.requestedQuantity),
        approved: Number(i.requestedQuantity),
        price: Number(special ?? i.product.basePrice),
        special: special != null,
      };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, isSpecialPricing, specialRows]);

  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    if (source === 'GODOWN') {
      for (const row of godownStock?.finishedGoods ?? []) map.set(row.product.id, Number(row.quantity));
    } else {
      for (const row of mainStock ?? []) map.set(row.product.id, Number(row.quantity));
    }
    return map;
  }, [source, mainStock, godownStock]);

  const updateLine = (itemId: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.itemId === itemId ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + l.approved * l.price, 0);

  const submit = () => {
    if (lines.some((l) => l.approved < 0)) { toast.error('Approved quantity cannot be negative'); return; }
    if (lines.some((l) => l.price < 0)) { toast.error('Price cannot be negative'); return; }
    if (!order) return;
    confirm.mutate(
      { id: order.id, fulfillmentSource: source, isGstBill, items: lines.map((l) => ({ itemId: l.itemId, confirmedQuantity: l.approved, unitPrice: l.price })) },
      {
        onSuccess: () => {
          toast.success(`Order ${order.orderNumber} confirmed`);
          printOrderPickList(
            { orderNumber: order.orderNumber, outletName: order.outlet.name, fulfillmentSource: source, isGstBill },
            lines.map((l) => ({ name: l.name, unit: l.unit, approvedQty: l.approved, price: l.price })),
          );
          onClose();
        },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={!!order} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Confirm {order?.orderNumber}
            {isSpecialPricing && <Badge variant="info"><Tag className="mr-1 -ml-0.5 inline h-3 w-3" />Special pricing outlet</Badge>}
          </DialogTitle>
          <DialogDescription>{order?.outlet.name} requested these items — review quantity, price and where it ships from.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-4">
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
        </div>

        <div className="max-h-[42vh] overflow-y-auto rounded-md border border-border scrollbar-thin">
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH className="text-right">Requested</TH>
                <TH className="text-right">Available</TH>
                <TH className="w-[110px] text-right">Approved qty</TH>
                <TH className="w-[110px] text-right">Price</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {lines.length === 0 && isSpecialPricing && specialRows === undefined ? (
                <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">Loading outlet prices…</TD></TR>
              ) : (
                lines.map((l) => {
                  const available = stockMap.get(l.productId) ?? 0;
                  const short = l.approved > available;
                  return (
                    <TR key={l.itemId}>
                      <TD className="font-medium">{l.name}</TD>
                      <TD className="text-right text-muted-foreground">{l.requested} {l.unit}</TD>
                      <TD className={cn('text-right', short ? 'font-semibold text-danger' : 'text-muted-foreground')}>
                        <span className="inline-flex items-center gap-1 justify-end">{short && <AlertTriangle className="h-3.5 w-3.5" />}{available} {l.unit}</span>
                      </TD>
                      <TD className="px-1.5 py-1.5">
                        <Input type="number" step="0.01" className="h-8 text-right" value={l.approved} onChange={(e) => updateLine(l.itemId, { approved: Number(e.target.value) })} />
                      </TD>
                      <TD className="px-1.5 py-1.5">
                        <div className="flex items-center gap-1">
                          {l.special && <Tag className="h-3.5 w-3.5 shrink-0 text-primary" />}
                          <Input type="number" step="0.01" className="h-8 text-right" value={l.price} onChange={(e) => updateLine(l.itemId, { price: Number(e.target.value), special: false })} />
                        </div>
                      </TD>
                      <TD className="text-right font-semibold">{formatINR(l.approved * l.price)}</TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </div>

        <div className="flex justify-between rounded-md border border-border bg-surface p-3 text-label font-semibold">
          <span>Estimated total {isGstBill ? '(+ GST at billing)' : '(no GST)'}</span><span>{formatINR(total)}</span>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={confirm.isPending}>Confirm Order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
