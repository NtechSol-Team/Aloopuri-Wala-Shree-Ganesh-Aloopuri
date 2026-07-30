'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Plus, Trash2, ShoppingCart, X, PackageCheck, CreditCard,
  CheckCircle2, Ban, Clock, Info, Printer, Wallet,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiErrorMessage } from '@/lib/api';
import { cn, formatINR, formatQty } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useProducts } from '@/hooks/useProducts';
import { stepFor } from '@/hooks/useUnits';
import {
  useCreateOrder, useOrders, useFulfilOrder,
  ACTIVE_ORDER_STATUSES, ORDER_STATUS_BADGE, ORDER_STATUS_LABEL,
  amountDue, isPendingPayment, isCompleted,
  type Order,
} from '@/hooks/useOrders';
import { PrinterSettingsDialog } from '@/components/printer-settings-dialog';
import { OrderPaymentDialog } from '@/components/orders/order-payment-dialog';
import { RejectOrderDialog } from '@/components/orders/reject-order-dialog';
import { PayDialog, type PayTarget } from '@/components/payments/pay-dialog';

/**
 * The fulfiller's workflow, left to right. Only the first and last are real
 * statuses — "Pending Payment" and "Completed" both live inside DELIVERED and are
 * told apart by whether the bill still has a balance.
 */
type Bucket = 'CONFIRMED' | 'DELIVERED' | 'PENDING_PAYMENT' | 'COMPLETED' | 'CANCELLED';

const TABS: Array<{ bucket: Bucket; label: string; icon: typeof Clock }> = [
  { bucket: 'CONFIRMED', label: 'Confirm Orders', icon: Clock },
  { bucket: 'DELIVERED', label: 'Delivered', icon: PackageCheck },
  { bucket: 'PENDING_PAYMENT', label: 'Pending Payment', icon: Wallet },
  { bucket: 'COMPLETED', label: 'Completed', icon: CheckCircle2 },
  { bucket: 'CANCELLED', label: 'Cancelled', icon: Ban },
];

function inBucket(order: Order, bucket: Bucket): boolean {
  switch (bucket) {
    case 'CONFIRMED': return order.status === 'CONFIRMED';
    case 'DELIVERED': return order.status === 'DELIVERED';
    case 'PENDING_PAYMENT': return isPendingPayment(order);
    case 'COMPLETED': return isCompleted(order);
    case 'CANCELLED': return order.status === 'CANCELLED';
  }
}

export function OrdersTab() {
  const role = useAuthStore((s) => s.user?.role);
  // Main owner and godown both work the fulfilment queue; a franchise owner only
  // ever sees their own outlet's orders.
  const isFulfiller = role === 'SUPER_ADMIN' || role === 'GODOWN_MANAGER';
  const { data, isLoading } = useOrders();

  const [tab, setTab] = useState<Bucket>('CONFIRMED');
  const [placing, setPlacing] = useState(false);
  const [payFor, setPayFor] = useState<Order | null>(null);
  const [payBillFor, setPayBillFor] = useState<PayTarget | null>(null);
  const [killFor, setKillFor] = useState<Order | null>(null);
  const [printerOpen, setPrinterOpen] = useState(false);
  const fulfil = useFulfilOrder();

  const orders = data ?? [];
  const counts = useMemo(() => {
    const c = {} as Record<Bucket, number>;
    for (const t of TABS) c[t.bucket] = orders.filter((o) => inBucket(o, t.bucket)).length;
    return c;
  }, [orders]);

  // An outlet may only have one order awaiting fulfilment; "Order Stock" stays
  // disabled until it ships.
  const activeOrder = orders.find((o) => ACTIVE_ORDER_STATUSES.includes(o.status)) ?? null;

  const visible = isFulfiller ? orders.filter((o) => inBucket(o, tab)) : orders;

  const doFulfil = (o: Order) =>
    fulfil.mutate(o.id, {
      onSuccess: () => toast.success(`${o.orderNumber} fulfilled — delivered to ${o.outlet.name}`),
      onError: (e) => toast.error(apiErrorMessage(e)),
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body text-muted-foreground">
          {isFulfiller ? 'Incoming stock orders from all outlets, by stage.' : 'Order stock from the main branch.'}
        </p>
        {isFulfiller ? (
          <Button variant="secondary" onClick={() => setPrinterOpen(true)}>
            <Printer className="h-4 w-4" /> Printer Settings
          </Button>
        ) : (
          <Button onClick={() => setPlacing(true)} disabled={!!activeOrder} title={activeOrder ? 'You already have an order awaiting fulfilment' : undefined}>
            <Plus className="h-4 w-4" /> Order Stock
          </Button>
        )}
      </div>

      {!isFulfiller && activeOrder && <OutletActiveBanner order={activeOrder} onPay={() => setPayFor(activeOrder)} />}

      {isFulfiller && (
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 scrollbar-thin">
          {TABS.map(({ bucket, label, icon: Icon }) => (
            <button
              key={bucket}
              onClick={() => setTab(bucket)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-caption font-medium transition-colors',
                tab === bucket ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-surface',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              {counts[bucket] > 0 && (
                <span className={cn('rounded px-1.5 text-caption tabular-nums', tab === bucket ? 'bg-primary-foreground/20' : 'bg-surface')}>
                  {counts[bucket]}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</Card>
      ) : !visible.length ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <ShoppingCart className="h-8 w-8 text-muted-foreground" />
          <p className="text-body text-muted-foreground">
            {isFulfiller ? `Nothing in ${TABS.find((t) => t.bucket === tab)?.label.toLowerCase()}.` : 'No orders yet.'}
          </p>
          {!isFulfiller && !activeOrder && <Button onClick={() => setPlacing(true)}><Plus className="h-4 w-4" /> Place your first order</Button>}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Order #</TH>
                {isFulfiller && <TH>Outlet</TH>}
                <TH>Items</TH>
                <TH>Date</TH>
                <TH className="text-right">Amount</TH>
                <TH className="text-right">Due</TH>
                <TH>Bill</TH>
                {!isFulfiller && <TH>Status</TH>}
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {visible.map((o) => {
                const due = amountDue(o);
                return (
                  <TR key={o.id}>
                    <TD className="font-medium">
                      {o.orderNumber}
                      {o.status === 'CANCELLED' && o.cancellationReason && (
                        <span className="mt-0.5 flex items-start gap-1 text-caption font-normal text-danger">
                          <Info className="mt-0.5 h-3 w-3 shrink-0" />{o.cancellationReason}
                        </span>
                      )}
                    </TD>
                    {isFulfiller && <TD>{o.outlet.name}</TD>}
                    <TD className="max-w-xs">
                      <div className="space-y-0.5">
                        {o.items.map((i) => (
                          <div key={i.id} className="truncate text-caption">
                            <span className="text-foreground">{i.product.name}</span>{' '}
                            <span className="text-muted-foreground">
                              {formatQty(i.confirmedQuantity ?? i.requestedQuantity, i.product.unit.decimalPlaces)} {i.product.unit.name}
                            </span>
                          </div>
                        ))}
                      </div>
                    </TD>
                    <TD>{format(new Date(o.orderDate), 'dd MMM')}</TD>
                    <TD className="text-right font-semibold">{formatINR(o.totals.grandTotal)}</TD>
                    <TD className="text-right">
                      {o.status !== 'DELIVERED' ? (
                        <span className="text-muted-foreground">—</span>
                      ) : due > 0 ? (
                        <span className="font-semibold text-warning">{formatINR(due)}</span>
                      ) : (
                        <Badge variant="success">Paid</Badge>
                      )}
                    </TD>
                    <TD>{o.bill ? <Badge variant={o.bill.status === 'PAID' ? 'success' : 'warning'}>{o.bill.billNumber}</Badge> : <span className="text-muted-foreground">—</span>}</TD>
                    {!isFulfiller && (
                      <TD><Badge variant={ORDER_STATUS_BADGE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge></TD>
                    )}
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        {isFulfiller ? (
                          o.status === 'CONFIRMED' ? (
                            <>
                              <Button size="sm" loading={fulfil.isPending} onClick={() => doFulfil(o)}>
                                <PackageCheck className="h-3.5 w-3.5" /> Fulfil
                              </Button>
                              <Button size="sm" variant="ghost" title="Cancel order" onClick={() => setKillFor(o)}>
                                <X className="h-3.5 w-3.5 text-danger" />
                              </Button>
                            </>
                          ) : due > 0 && o.bill ? (
                            // The outlet handed over cash (or is paying online in front of
                            // you) — record it against the bill right from here, instead of
                            // having to go find it on the Billing page.
                            <Button
                              size="sm"
                              onClick={() => setPayBillFor({ id: o.bill!.id, billNumber: o.bill!.billNumber, balanceDue: o.bill!.balanceDue, outletName: o.outlet.name })}
                            >
                              <CreditCard className="h-3.5 w-3.5" /> Pay Now
                            </Button>
                          ) : (
                            <span className="text-caption text-muted-foreground">—</span>
                          )
                        ) : due > 0 ? (
                          <Button size="sm" onClick={() => setPayFor(o)}>
                            <CreditCard className="h-3.5 w-3.5" /> Pay {formatINR(due)}
                          </Button>
                        ) : o.status === 'CONFIRMED' ? (
                          <Button size="sm" variant="secondary" onClick={() => setPayFor(o)}>
                            <CreditCard className="h-3.5 w-3.5" /> Pay now
                          </Button>
                        ) : (
                          <span className="text-caption text-muted-foreground">—</span>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}

      <OrderStockDialog open={placing} onOpenChange={setPlacing} onPlaced={(o) => setPayFor(o)} />
      <OrderPaymentDialog order={payFor} onClose={() => setPayFor(null)} />
      <PayDialog bill={payBillFor} onClose={() => setPayBillFor(null)} />
      <RejectOrderDialog order={killFor} mode="cancel" onClose={() => setKillFor(null)} />
      <PrinterSettingsDialog open={printerOpen} onOpenChange={setPrinterOpen} />
    </div>
  );
}

/** Tells the outlet where their in-flight order stands, and what they can do now. */
function OutletActiveBanner({ order, onPay }: { order: Order; onPay: () => void }) {
  return (
    <Card className="flex flex-col gap-3 border-l-4 border-l-primary p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="flex items-center gap-2 text-label font-semibold">
          {order.orderNumber}
          <Badge variant={ORDER_STATUS_BADGE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
        </p>
        <p className="mt-0.5 text-caption text-muted-foreground">
          Your order is with the main branch for fulfilment. You can pay now or once it&apos;s delivered —
          either way, you can place a new order after this one ships.
        </p>
      </div>
      <Button onClick={onPay}><CreditCard className="h-4 w-4" /> Pay now · {formatINR(order.totals.grandTotal)}</Button>
    </Card>
  );
}

interface CartRow { productId: string; requestedQuantity: number }

function OrderStockDialog({ open, onOpenChange, onPlaced }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPlaced: (order: Order) => void;
}) {
  const { data: products } = useProducts({ isPosEnabled: false });
  const create = useCreateOrder();
  const [rows, setRows] = useState<CartRow[]>([]);

  useEffect(() => {
    if (open) setRows(products?.rows[0] ? [{ productId: products.rows[0].id, requestedQuantity: 5 }] : []);
  }, [open, products]);

  const list = products?.rows ?? [];
  const priceOf = (id: string) => Number(list.find((p) => p.id === id)?.mrp ?? 0);
  const total = rows.reduce((s, r) => s + priceOf(r.productId) * r.requestedQuantity, 0);

  const add = () => list[0] && setRows((r) => [...r, { productId: list[0].id, requestedQuantity: 5 }]);
  const upd = (i: number, patch: Partial<CartRow>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const rm = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!rows.length || rows.some((r) => r.requestedQuantity <= 0)) { toast.error('Add valid items'); return; }
    create.mutate({ items: rows }, {
      // Placing no longer confirms anything — go straight to choosing how to pay.
      onSuccess: (order) => { onOpenChange(false); onPlaced(order); },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Order Stock</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select className="flex-1" value={row.productId} onChange={(e) => upd(i, { productId: e.target.value })}>
                {list.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatINR(p.mrp)}/{p.unit.name}</option>)}
              </Select>
              <Input
                type="number"
                className="w-24"
                step={stepFor(list.find((p) => p.id === row.productId)?.unit.decimalPlaces ?? 0)}
                value={row.requestedQuantity}
                onChange={(e) => upd(i, { requestedQuantity: Number(e.target.value) })}
              />
              <Button variant="ghost" size="icon" onClick={() => rm(i)}><Trash2 className="h-4 w-4 text-danger" /></Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={add}><Plus className="h-4 w-4" /> Add item</Button>
          <div className="flex justify-between border-t border-border pt-2 text-label font-semibold">
            <span>Estimated total</span><span>{formatINR(total)}</span>
          </div>
          <p className="text-caption text-muted-foreground">You&apos;ll choose how to pay — online or on credit — in the next step.</p>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending}>Place Order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
