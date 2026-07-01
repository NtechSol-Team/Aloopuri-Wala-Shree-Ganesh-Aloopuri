'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Plus, Trash2, Truck, ArrowRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiErrorMessage } from '@/lib/api';
import { useProducts } from '@/hooks/useProducts';
import { useOutlets } from '@/hooks/useOutlets';
import { useCreateTransfer, useTransfers, useUpdateTransferStatus, type TransferStatus } from '@/hooks/useTransfers';

const NEXT: Partial<Record<TransferStatus, { to: TransferStatus; label: string }>> = {
  DRAFT: { to: 'DISPATCHED', label: 'Dispatch' },
  DISPATCHED: { to: 'RECEIVED', label: 'Mark Received' },
};

export default function TransfersPage() {
  const { data, isLoading } = useTransfers();
  const [open, setOpen] = useState(false);
  const advance = useUpdateTransferStatus();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-body text-muted-foreground">Move finished goods from the godown to the main branch.</p>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New Transfer</Button>
      </div>

      {isLoading ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</Card>
      ) : !data?.length ? (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <Truck className="h-8 w-8 text-muted-foreground" />
          <p className="text-body text-muted-foreground">No transfers yet.</p>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Create first transfer</Button>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead><TR><TH>Transfer #</TH><TH>Destination</TH><TH>Items</TH><TH>Vehicle</TH><TH>Date</TH><TH>Status</TH><TH className="text-right">Action</TH></TR></THead>
            <TBody>
              {data.map((t) => (
                <TR key={t.id}>
                  <TD className="font-medium">{t.transferNumber}</TD>
                  <TD>{t.destinationType === 'OUTLET' ? <Badge variant="info">{t.destinationOutlet?.name ?? 'Outlet'}</Badge> : <Badge variant="neutral">Main Branch</Badge>}</TD>
                  <TD className="text-muted-foreground">{t.items.map((i) => `${i.product.name} ×${Number(i.quantity)}`).join(', ')}</TD>
                  <TD>{t.vehicleNumber ?? '—'}</TD>
                  <TD>{format(new Date(t.transferDate), 'dd MMM yyyy')}</TD>
                  <TD><Badge variant={statusBadgeVariant(t.status)}>{t.status}</Badge></TD>
                  <TD className="text-right">
                    {NEXT[t.status] ? (
                      <Button
                        size="sm" variant="secondary"
                        loading={advance.isPending}
                        onClick={() =>
                          advance.mutate(
                            { id: t.id, status: NEXT[t.status]!.to },
                            { onSuccess: () => toast.success(`Transfer ${NEXT[t.status]!.label.toLowerCase()}d`), onError: (e) => toast.error(apiErrorMessage(e)) },
                          )
                        }
                      >
                        {NEXT[t.status]!.label} <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <span className="text-caption text-muted-foreground">—</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      <CreateTransferDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

interface ItemRow { productId: string; quantity: number }

function CreateTransferDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: products } = useProducts();
  const { data: outlets } = useOutlets();
  const create = useCreateTransfer();
  const [vehicleNumber, setVehicle] = useState('');
  const [destination, setDestination] = useState('MAIN_BRANCH'); // 'MAIN_BRANCH' or an outletId
  const [rows, setRows] = useState<ItemRow[]>([]);

  useEffect(() => {
    if (open) {
      setRows(products?.rows[0] ? [{ productId: products.rows[0].id, quantity: 10 }] : []);
      setVehicle('');
      setDestination('MAIN_BRANCH');
    }
  }, [open, products]);

  const list = products?.rows ?? [];
  const addRow = () => list[0] && setRows((r) => [...r, { productId: list[0].id, quantity: 10 }]);
  const update = (i: number, patch: Partial<ItemRow>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const remove = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const submit = () => {
    if (!rows.length || rows.some((r) => r.quantity <= 0)) { toast.error('Add valid items'); return; }
    const toOutlet = destination !== 'MAIN_BRANCH';
    create.mutate(
      { destinationType: toOutlet ? 'OUTLET' : 'MAIN_BRANCH', destinationOutletId: toOutlet ? destination : undefined, vehicleNumber: vehicleNumber || undefined, items: rows },
      { onSuccess: () => { toast.success('Transfer created (Draft)'); onOpenChange(false); }, onError: (e) => toast.error(apiErrorMessage(e)) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>New Stock Transfer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Destination</Label>
              <Select value={destination} onChange={(e) => setDestination(e.target.value)}>
                <option value="MAIN_BRANCH">Main Branch</option>
                <optgroup label="Direct to outlet">
                  {outlets?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </optgroup>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vehicle Number</Label>
              <Input value={vehicleNumber} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. GJ-05-AB-1234" />
            </div>
          </div>
          <Label>Items</Label>
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Select className="flex-1" value={row.productId} onChange={(e) => update(i, { productId: e.target.value })}>
                {list.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
              </Select>
              <Input type="number" className="w-28" value={row.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
              <Button variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4 text-danger" /></Button>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={addRow}><Plus className="h-4 w-4" /> Add item</Button>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending}>Create Transfer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
