'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, Tag } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useOutletPrices, useSetOutletPrices, type Outlet } from '@/hooks/useOutlets';

export function OutletPricesDialog({ outlet, onClose }: { outlet: Outlet | null; onClose: () => void }) {
  const open = !!outlet;
  const { data: rows, isLoading } = useOutletPrices(outlet?.id ?? null);
  const save = useSetOutletPrices(outlet?.id ?? '');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (rows) setPrices(Object.fromEntries(rows.map((r) => [r.id, r.specialPrice ?? ''])));
  }, [rows]);

  const filtered = (rows ?? []).filter((r) => !search.trim() || r.name.toLowerCase().includes(search.toLowerCase()) || r.sku.toLowerCase().includes(search.toLowerCase()));
  const specialCount = Object.values(prices).filter((v) => v.trim() !== '').length;

  const onSave = () => {
    const items = Object.entries(prices)
      .filter(([, v]) => v.trim() !== '')
      .map(([productId, v]) => ({ productId, price: Number(v) }));
    if (items.some((i) => !Number.isFinite(i.price) || i.price < 0)) { toast.error('Enter valid prices'); return; }
    save.mutate(items, {
      onSuccess: () => { toast.success(`Special prices saved for ${outlet?.name}`); onClose(); },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Special Prices — {outlet?.name}</DialogTitle>
          <DialogDescription>Set a custom price per product for this outlet. Leave blank to use the standard catalog price. {specialCount > 0 && `${specialCount} product(s) customized.`}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search products…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <div className="max-h-[46vh] overflow-y-auto rounded-md border border-border scrollbar-thin">
            <Table>
              <THead><TR><TH>Product</TH><TH className="text-right">Catalog price</TH><TH className="w-[140px] text-right">Special price</TH></TR></THead>
              <TBody>
                {filtered.map((r) => {
                  const customized = (prices[r.id] ?? '').trim() !== '';
                  return (
                    <TR key={r.id}>
                      <TD className="font-medium">{r.name}<span className="ml-1.5 text-caption text-muted-foreground">{r.sku}</span></TD>
                      <TD className="text-right text-muted-foreground">{formatINR(r.basePrice)}</TD>
                      <TD className="px-1.5 py-1.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {customized && <Tag className="h-3.5 w-3.5 text-primary" />}
                          <Input
                            type="number" step="0.01" placeholder={Number(r.basePrice).toFixed(2)}
                            className="h-8 w-24 text-right"
                            value={prices[r.id] ?? ''}
                            onChange={(e) => setPrices((p) => ({ ...p, [r.id]: e.target.value }))}
                          />
                        </div>
                      </TD>
                    </TR>
                  );
                })}
                {filtered.length === 0 && <TR><TD colSpan={3} className="py-8 text-center text-muted-foreground">No products match.</TD></TR>}
              </TBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} loading={save.isPending}>Save Special Prices</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
