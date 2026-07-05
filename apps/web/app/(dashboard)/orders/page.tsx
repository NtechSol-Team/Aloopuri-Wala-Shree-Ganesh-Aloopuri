'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Plus, Trash2, ShoppingCart, ArrowRight, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiErrorMessage } from '@/lib/api';
import { cn, formatINR } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useProducts } from '@/hooks/useProducts';
import { useCreateOrder, useOrderAction, useOrders, type Order, type OrderStatus } from '@/hooks/useOrders';
import { ConfirmOrderDialog } from '@/components/orders/confirm-order-dialog';

// PENDING opens the review dialog instead of a blind one-click action.
const ADMIN_ACTION: Partial<Record<OrderStatus, { action: 'dispatch' | 'deliver'; label: string }>> = {
  CONFIRMED: { action: 'dispatch', label: 'Dispatch + Bill' },
  DISPATCHED: { action: 'deliver', label: 'Mark Delivered' },
};

export default function OrdersPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === 'SUPER_ADMIN';
  const { data, isLoading } = useOrders();
  const [open, setOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<Order | null>(null);
  const act = useOrderAction();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-body text-muted-foreground">{isAdmin ? 'Incoming stock orders from all outlets.' : 'Order stock from the main branch.'}</p>
        {!isAdmin && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Order Stock</Button>}
      </div>

      {isLoading ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</Card>
      ) : !data?.length ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <ShoppingCart className="h-8 w-8 text-muted-foreground" />
          <p className="text-body text-muted-foreground">No orders yet.</p>
          {!isAdmin && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Place your first order</Button>}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Order #</TH>{isAdmin && <TH>Outlet</TH>}<TH>Items</TH><TH>Date</TH><TH>Bill</TH><TH>Status</TH><TH className="text-right">Action</TH>
              </TR>
            </THead>
            <TBody>
              {data.map((o) => {
                const next = isAdmin ? ADMIN_ACTION[o.status] : undefined;
                const canReview = isAdmin && o.status === 'PENDING';
                const canCancel = !isAdmin && (o.status === 'PENDING' || o.status === 'CONFIRMED');
                return (
                  <TR key={o.id}>
                    <TD className="font-medium">{o.orderNumber}</TD>
                    {isAdmin && <TD>{o.outlet.name}</TD>}
                    <TD className="max-w-xs">
                      <div className="space-y-0.5">
                        {o.items.map((i) => {
                          const requested = Number(i.requestedQuantity);
                          const approved = i.confirmedQuantity != null ? Number(i.confirmedQuantity) : null;
                          const short = approved != null && approved < requested;
                          return (
                            <div key={i.id} className="truncate text-caption">
                              <span className="text-foreground">{i.product.name}</span>{' '}
                              <span className="text-muted-foreground">req {requested}</span>
                              {approved != null && (
                                <span className={cn('font-medium', short ? 'text-warning' : 'text-success')}> · approved {approved}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </TD>
                    <TD>{format(new Date(o.orderDate), 'dd MMM')}</TD>
                    <TD>{o.bill ? <Badge variant={statusBadgeVariant(o.bill.status)}>{o.bill.billNumber}</Badge> : <span className="text-muted-foreground">—</span>}</TD>
                    <TD><Badge variant={statusBadgeVariant(o.status)}>{o.status}</Badge></TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        {canReview && (
                          <Button size="sm" variant="secondary" onClick={() => setConfirmTarget(o)}>
                            Review &amp; Confirm <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {next && (
                          <Button size="sm" variant="secondary" loading={act.isPending}
                            onClick={() => act.mutate({ id: o.id, action: next.action }, { onSuccess: () => toast.success(`Order ${next.label.toLowerCase()}ed`), onError: (e) => toast.error(apiErrorMessage(e)) })}>
                            {next.label} <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canCancel && (
                          <Button size="sm" variant="ghost"
                            onClick={() => act.mutate({ id: o.id, action: 'cancel' }, { onSuccess: () => toast.success('Order cancelled'), onError: (e) => toast.error(apiErrorMessage(e)) })}>
                            <X className="h-3.5 w-3.5 text-danger" />
                          </Button>
                        )}
                        {!canReview && !next && !canCancel && <span className="text-caption text-muted-foreground">—</span>}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}

      <OrderStockDialog open={open} onOpenChange={setOpen} />
      <ConfirmOrderDialog order={confirmTarget} onClose={() => setConfirmTarget(null)} />
    </div>
  );
}

interface CartRow { productId: string; requestedQuantity: number }

function OrderStockDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: products } = useProducts();
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
    create.mutate({ items: rows }, { onSuccess: () => { toast.success('Order placed'); onOpenChange(false); }, onError: (e) => toast.error(apiErrorMessage(e)) });
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
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending}>Place Order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
