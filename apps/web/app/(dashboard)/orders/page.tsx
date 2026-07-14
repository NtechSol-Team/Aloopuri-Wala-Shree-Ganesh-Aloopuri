'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Plus, Trash2, ShoppingCart, X, Truck, PackageCheck, CreditCard, Landmark,
  CheckCircle2, Ban, Clock, Info,
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
import { cn, formatINR } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useProducts } from '@/hooks/useProducts';
import {
  useCreateOrder, useOrders, useReceiveOrder,
  ACTIVE_ORDER_STATUSES, ORDER_STATUS_BADGE, ORDER_STATUS_LABEL,
  type Order, type OrderStatus,
} from '@/hooks/useOrders';
import { OrderPaymentDialog } from '@/components/orders/order-payment-dialog';
import { ApproveOrderDialog } from '@/components/orders/approve-order-dialog';
import { DispatchOrderDialog } from '@/components/orders/dispatch-order-dialog';
import { RejectOrderDialog } from '@/components/orders/reject-order-dialog';

/** The main owner's workflow, left to right. Each order sits in exactly one of these. */
const TABS: Array<{ status: OrderStatus; icon: typeof Clock }> = [
  { status: 'PAYMENT_PENDING', icon: Clock },
  { status: 'CREDIT_APPROVAL_PENDING', icon: Landmark },
  { status: 'CONFIRMED', icon: CheckCircle2 },
  { status: 'DISPATCHED', icon: Truck },
  { status: 'DELIVERED', icon: PackageCheck },
  { status: 'CANCELLED', icon: Ban },
];

export default function OrdersPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'SUPER_ADMIN';
  const { data, isLoading } = useOrders();

  const [tab, setTab] = useState<OrderStatus>('CREDIT_APPROVAL_PENDING');
  const [placing, setPlacing] = useState(false);
  const [payFor, setPayFor] = useState<Order | null>(null);
  const [approveFor, setApproveFor] = useState<Order | null>(null);
  const [dispatchFor, setDispatchFor] = useState<Order | null>(null);
  const [killFor, setKillFor] = useState<Order | null>(null);
  const receive = useReceiveOrder();

  const orders = data ?? [];
  const counts = useMemo(() => {
    const c = {} as Record<OrderStatus, number>;
    for (const t of TABS) c[t.status] = orders.filter((o) => o.status === t.status).length;
    return c;
  }, [orders]);

  // An outlet may only have one order in flight; the "Order Stock" button stays
  // disabled until they receive (or cancel) it.
  const activeOrder = orders.find((o) => ACTIVE_ORDER_STATUSES.includes(o.status)) ?? null;

  const visible = isAdmin ? orders.filter((o) => o.status === tab) : orders;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body text-muted-foreground">
          {isAdmin ? 'Incoming stock orders from all outlets, by stage.' : 'Order stock from the main branch.'}
        </p>
        {!isAdmin && (
          <Button onClick={() => setPlacing(true)} disabled={!!activeOrder} title={activeOrder ? 'You already have an active order' : undefined}>
            <Plus className="h-4 w-4" /> Order Stock
          </Button>
        )}
      </div>

      {!isAdmin && activeOrder && <OutletActiveBanner order={activeOrder} onPay={() => setPayFor(activeOrder)} />}

      {isAdmin && (
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 scrollbar-thin">
          {TABS.map(({ status, icon: Icon }) => (
            <button
              key={status}
              onClick={() => setTab(status)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-caption font-medium transition-colors',
                tab === status ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-surface',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {ORDER_STATUS_LABEL[status]}
              {counts[status] > 0 && (
                <span className={cn('rounded px-1.5 text-caption tabular-nums', tab === status ? 'bg-primary-foreground/20' : 'bg-surface')}>
                  {counts[status]}
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
            {isAdmin ? `No orders in ${ORDER_STATUS_LABEL[tab].toLowerCase()}.` : 'No orders yet.'}
          </p>
          {!isAdmin && !activeOrder && <Button onClick={() => setPlacing(true)}><Plus className="h-4 w-4" /> Place your first order</Button>}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Order #</TH>
                {isAdmin && <TH>Outlet</TH>}
                <TH>Items</TH>
                <TH>Date</TH>
                <TH className="text-right">Amount</TH>
                <TH>Payment</TH>
                <TH>Bill</TH>
                {!isAdmin && <TH>Status</TH>}
                <TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {visible.map((o) => (
                <TR key={o.id}>
                  <TD className="font-medium">
                    {o.orderNumber}
                    {o.status === 'CANCELLED' && o.cancellationReason && (
                      <span className="mt-0.5 flex items-start gap-1 text-caption font-normal text-danger">
                        <Info className="mt-0.5 h-3 w-3 shrink-0" />{o.cancellationReason}
                      </span>
                    )}
                  </TD>
                  {isAdmin && <TD>{o.outlet.name}</TD>}
                  <TD className="max-w-xs">
                    <div className="space-y-0.5">
                      {o.items.map((i) => {
                        const requested = Number(i.requestedQuantity);
                        const approved = i.confirmedQuantity != null ? Number(i.confirmedQuantity) : null;
                        const trimmed = approved != null && approved < requested;
                        return (
                          <div key={i.id} className="truncate text-caption">
                            <span className="text-foreground">{i.product.name}</span>{' '}
                            <span className={cn(trimmed ? 'font-medium text-warning' : 'text-muted-foreground')}>
                              {approved ?? requested} {i.product.unit}
                            </span>
                            {trimmed && <span className="text-muted-foreground"> (of {requested})</span>}
                          </div>
                        );
                      })}
                    </div>
                  </TD>
                  <TD>{format(new Date(o.orderDate), 'dd MMM')}</TD>
                  <TD className="text-right font-semibold">{formatINR(o.totals.grandTotal)}</TD>
                  <TD>
                    {o.paymentMode === 'ONLINE' ? (
                      <Badge variant={o.bill?.status === 'PAID' ? 'success' : 'warning'}>
                        <CreditCard className="mr-1 -ml-0.5 inline h-3 w-3" />
                        {o.bill?.status === 'PAID' ? 'Paid online' : 'Online — unpaid'}
                      </Badge>
                    ) : o.paymentMode === 'CREDIT' ? (
                      <Badge variant="info"><Landmark className="mr-1 -ml-0.5 inline h-3 w-3" />Credit</Badge>
                    ) : (
                      <span className="text-caption text-muted-foreground">Not chosen</span>
                    )}
                  </TD>
                  <TD>{o.bill ? <Badge variant={o.bill.status === 'PAID' ? 'success' : 'warning'}>{o.bill.billNumber}</Badge> : <span className="text-muted-foreground">—</span>}</TD>
                  {!isAdmin && (
                    <TD><Badge variant={ORDER_STATUS_BADGE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge></TD>
                  )}
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      {isAdmin ? (
                        <>
                          {o.status === 'CREDIT_APPROVAL_PENDING' && (
                            <>
                              <Button size="sm" onClick={() => setApproveFor(o)}>Approve</Button>
                              <Button size="sm" variant="ghost" onClick={() => setKillFor(o)}><X className="h-3.5 w-3.5 text-danger" /></Button>
                            </>
                          )}
                          {o.status === 'CONFIRMED' && (
                            <Button size="sm" variant="secondary" onClick={() => setDispatchFor(o)}>
                              <Truck className="h-3.5 w-3.5" /> Dispatch
                            </Button>
                          )}
                          {o.status === 'DISPATCHED' && (
                            <span className="text-caption text-muted-foreground">Waiting on outlet</span>
                          )}
                          {(o.status === 'PAYMENT_PENDING' || o.status === 'DELIVERED' || o.status === 'CANCELLED') && (
                            <span className="text-caption text-muted-foreground">—</span>
                          )}
                        </>
                      ) : (
                        <>
                          {o.status === 'PAYMENT_PENDING' && (
                            <>
                              <Button size="sm" onClick={() => setPayFor(o)}><CreditCard className="h-3.5 w-3.5" /> Pay now</Button>
                              <Button size="sm" variant="ghost" onClick={() => setKillFor(o)}><X className="h-3.5 w-3.5 text-danger" /></Button>
                            </>
                          )}
                          {o.status === 'CREDIT_APPROVAL_PENDING' && (
                            <>
                              <span className="self-center text-caption text-muted-foreground">Awaiting approval</span>
                              <Button size="sm" variant="ghost" onClick={() => setKillFor(o)}><X className="h-3.5 w-3.5 text-danger" /></Button>
                            </>
                          )}
                          {o.status === 'DISPATCHED' && (
                            <Button
                              size="sm"
                              loading={receive.isPending}
                              onClick={() => receive.mutate(o.id, {
                                onSuccess: () => toast.success('Order received — stock added to your outlet'),
                                onError: (e) => toast.error(apiErrorMessage(e)),
                              })}
                            >
                              <PackageCheck className="h-3.5 w-3.5" /> Receive Order
                            </Button>
                          )}
                          {(o.status === 'CONFIRMED' || o.status === 'DELIVERED' || o.status === 'CANCELLED') && (
                            <span className="text-caption text-muted-foreground">—</span>
                          )}
                        </>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <OrderStockDialog open={placing} onOpenChange={setPlacing} onPlaced={(o) => setPayFor(o)} />
      <OrderPaymentDialog order={payFor} onClose={() => setPayFor(null)} />
      <ApproveOrderDialog order={approveFor} onClose={() => setApproveFor(null)} />
      <DispatchOrderDialog order={dispatchFor} onClose={() => setDispatchFor(null)} />
      <RejectOrderDialog order={killFor} mode={isAdmin ? 'reject' : 'cancel'} onClose={() => setKillFor(null)} />
    </div>
  );
}

/** Tells the outlet exactly where their in-flight order stands, and what to do next. */
function OutletActiveBanner({ order, onPay }: { order: Order; onPay: () => void }) {
  const copy: Record<string, string> = {
    PAYMENT_PENDING: 'Your order is placed but not confirmed — pay online or request credit to confirm it.',
    CREDIT_APPROVAL_PENDING: 'Your credit request is with the main owner. You’ll be notified once it’s approved.',
    CONFIRMED: 'Confirmed! The main branch is preparing your order for dispatch.',
    DISPATCHED: 'Your order is on the way. Tap “Receive Order” once the goods physically arrive.',
  };

  return (
    <Card className="flex flex-col gap-3 border-l-4 border-l-primary p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="flex items-center gap-2 text-label font-semibold">
          {order.orderNumber}
          <Badge variant={ORDER_STATUS_BADGE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
        </p>
        <p className="mt-0.5 text-caption text-muted-foreground">
          {copy[order.status]} You can place a new order once this one is received.
        </p>
      </div>
      {order.status === 'PAYMENT_PENDING' && (
        <Button onClick={onPay}><CreditCard className="h-4 w-4" /> Complete payment · {formatINR(order.totals.grandTotal)}</Button>
      )}
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
  const priceOf = (id: string) => Number(list.find((p) => p.id === id)?.basePrice ?? 0);
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
                {list.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatINR(p.basePrice)}/{p.unit}</option>)}
              </Select>
              <Input type="number" className="w-24" value={row.requestedQuantity} onChange={(e) => upd(i, { requestedQuantity: Number(e.target.value) })} />
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
