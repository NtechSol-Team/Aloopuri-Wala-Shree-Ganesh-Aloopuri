'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Search, Package, ReceiptText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatINR, formatQty } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import {
  useAssets, useSaveAsset, useDeleteAsset,
  ASSET_STATUS_LABEL, ASSET_LOCATION_LABEL,
  type Asset, type AssetStatus, type AssetLocation,
} from '@/hooks/useAssets';

const STATUS_BADGE: Record<AssetStatus, 'success' | 'warning' | 'neutral'> = {
  IN_USE: 'success',
  IN_REPAIR: 'warning',
  RETIRED: 'neutral',
};

const today = () => new Date().toISOString().slice(0, 10);

export function AssetsTab() {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState<AssetStatus | ''>('');
  const { data, isLoading } = useAssets({
    search: deferredSearch || undefined,
    status: status || undefined,
  });
  const [editing, setEditing] = useState<Asset | null>(null);
  const [creating, setCreating] = useState(false);
  const del = useDeleteAsset();

  const rows = data?.rows ?? [];

  const remove = (a: Asset) => {
    if (!window.confirm(`Remove ${a.assetCode} — ${a.name}?`)) return;
    del.mutate(a.id, {
      onSuccess: () => toast.success('Asset removed'),
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-body text-muted-foreground">
            Everything the business owns. Items bought on a purchase bill with &ldquo;Is Asset?&rdquo; ticked land here automatically.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-caption text-muted-foreground">Register value</p>
            <p className="text-card-title font-bold leading-none">{formatINR(data?.totalValue ?? 0)}</p>
          </div>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add Asset</Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, code or serial..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select className="w-full sm:w-48" value={status} onChange={(e) => setStatus(e.target.value as AssetStatus | '')}>
            <option value="">All statuses</option>
            {(Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((s) => (
              <option key={s} value={s}>{ASSET_STATUS_LABEL[s]}</option>
            ))}
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Package className="h-8 w-8 text-muted-foreground" />
            <p className="text-body text-muted-foreground">No assets yet.</p>
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add first asset</Button>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH><TH>Asset</TH><TH>Location</TH><TH className="text-right">Qty</TH>
                <TH className="text-right">Cost</TH><TH>Purchased</TH><TH>Status</TH><TH>Source</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((a) => (
                <TR key={a.id}>
                  <TD className="font-medium">{a.assetCode}</TD>
                  <TD>
                    {a.name}
                    {a.serialNumber && <span className="ml-1.5 text-caption text-muted-foreground">SN {a.serialNumber}</span>}
                  </TD>
                  <TD>{ASSET_LOCATION_LABEL[a.location]}</TD>
                  <TD className="text-right">{formatQty(a.quantity, 0)}</TD>
                  <TD className="text-right font-semibold">{formatINR(a.purchaseCost)}</TD>
                  <TD className="whitespace-nowrap">{format(new Date(a.purchaseDate), 'dd MMM yyyy')}</TD>
                  <TD><Badge variant={STATUS_BADGE[a.status]}>{ASSET_STATUS_LABEL[a.status]}</Badge></TD>
                  <TD>
                    {a.supplierBill ? (
                      <span className="inline-flex items-center gap-1 text-caption text-muted-foreground">
                        <ReceiptText className="h-3.5 w-3.5" />{a.supplierBill.billNumber}
                      </span>
                    ) : (
                      <span className="text-caption text-muted-foreground">Manual</span>
                    )}
                  </TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditing(a)}><Pencil className="h-4 w-4" /></Button>
                      <Button
                        variant="ghost" size="icon"
                        title={a.supplierBillId ? 'Came from a purchase bill — edit that bill instead' : 'Remove'}
                        onClick={() => remove(a)}
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <AssetFormDialog
        open={creating || !!editing}
        onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }}
        asset={editing}
      />
    </div>
  );
}

const empty = {
  name: '', description: '', serialNumber: '', quantity: 1, purchaseCost: 0,
  purchaseDate: today(), supplierName: '', invoiceNumber: '',
  location: 'GENERAL' as AssetLocation, status: 'IN_USE' as AssetStatus, notes: '',
};

function AssetFormDialog({ open, onOpenChange, asset }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  asset: Asset | null;
}) {
  const save = useSaveAsset();
  const [form, setForm] = useState({ ...empty });
  const set = <K extends keyof typeof empty>(k: K, v: (typeof empty)[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setForm(
      asset
        ? {
            name: asset.name,
            description: asset.description ?? '',
            serialNumber: asset.serialNumber ?? '',
            quantity: Number(asset.quantity),
            purchaseCost: Number(asset.purchaseCost),
            purchaseDate: asset.purchaseDate.slice(0, 10),
            supplierName: asset.supplierName ?? '',
            invoiceNumber: asset.invoiceNumber ?? '',
            location: asset.location,
            status: asset.status,
            notes: asset.notes ?? '',
          }
        : { ...empty },
    );
  }, [open, asset]);

  const fromBill = !!asset?.supplierBillId;

  const submit = () => {
    if (form.name.trim().length < 2) { toast.error('Enter an asset name'); return; }
    save.mutate(
      {
        id: asset?.id,
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        serialNumber: form.serialNumber.trim() || undefined,
        quantity: form.quantity,
        purchaseCost: form.purchaseCost,
        purchaseDate: form.purchaseDate,
        supplierName: form.supplierName.trim() || undefined,
        invoiceNumber: form.invoiceNumber.trim() || undefined,
        location: form.location,
        status: form.status,
        notes: form.notes.trim() || undefined,
      },
      {
        onSuccess: () => { toast.success(asset ? 'Asset updated' : 'Asset added'); onOpenChange(false); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{asset ? `Edit ${asset.assetCode}` : 'Add Asset'}</DialogTitle>
          {fromBill && (
            <DialogDescription>
              This asset came from purchase bill {asset?.supplierBill?.billNumber}. Its cost and supplier are
              controlled by that bill — change them there.
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Serial number</Label>
            <Input value={form.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Quantity</Label>
            <Input type="number" step="1" min={1} value={form.quantity} onChange={(e) => set('quantity', Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Purchase cost (₹)</Label>
            <Input type="number" step="0.01" value={form.purchaseCost} onChange={(e) => set('purchaseCost', Number(e.target.value))} disabled={fromBill} />
          </div>
          <div className="space-y-1.5">
            <Label>Purchase date</Label>
            <Input type="date" value={form.purchaseDate} onChange={(e) => set('purchaseDate', e.target.value)} disabled={fromBill} />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Select value={form.location} onChange={(e) => set('location', e.target.value as AssetLocation)}>
              {(Object.keys(ASSET_LOCATION_LABEL) as AssetLocation[]).map((l) => (
                <option key={l} value={l}>{ASSET_LOCATION_LABEL[l]}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onChange={(e) => set('status', e.target.value as AssetStatus)}>
              {(Object.keys(ASSET_STATUS_LABEL) as AssetStatus[]).map((s) => (
                <option key={s} value={s}>{ASSET_STATUS_LABEL[s]}</option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Supplier</Label>
            <Input value={form.supplierName} onChange={(e) => set('supplierName', e.target.value)} disabled={fromBill} />
          </div>
          <div className="space-y-1.5">
            <Label>Invoice no.</Label>
            <Input value={form.invoiceNumber} onChange={(e) => set('invoiceNumber', e.target.value)} disabled={fromBill} />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <textarea
              className="min-h-[64px] w-full rounded-md border border-border bg-card px-3 py-2 text-body outline-none focus:border-primary"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>{asset ? 'Save' : 'Add Asset'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
