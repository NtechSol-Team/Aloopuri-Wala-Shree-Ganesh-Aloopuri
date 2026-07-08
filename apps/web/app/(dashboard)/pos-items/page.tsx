'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Search, EyeOff, Utensils } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useProducts, useSaveProduct, useDeleteProduct, type Product } from '@/hooks/useProducts';
import { useMainBranchInventory } from '@/hooks/useInventory';
import { PosItemFormDialog } from '@/components/products/pos-item-form-dialog';

export default function PosItemsPage() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useProducts({ search: search || undefined, isPosEnabled: true });
  const { data: mainStock } = useMainBranchInventory();
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const save = useSaveProduct();
  const del = useDeleteProduct();

  const stockOf = (productId: string) => mainStock?.find((r) => r.product.id === productId)?.quantity;

  const removeFromPos = (p: Product) => {
    save.mutate({ id: p.id, isPosEnabled: false }, {
      onSuccess: () => toast.success(`${p.name} removed from POS`),
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-body font-medium">POS Items</p>
            <p className="text-caption text-muted-foreground">What's sellable at the counter — add snacks, beverages, and quick items here.</p>
          </div>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add POS Item</Button>
        </div>
        <div className="flex items-center gap-3 border-t border-border p-4">
          <div className="relative w-72 max-w-full">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search POS items…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : !data?.rows.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Utensils className="h-8 w-8 text-muted-foreground" />
            <p className="text-body text-muted-foreground">No POS items yet.</p>
            <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add first item</Button>
          </div>
        ) : (
          <Table>
            <THead><TR><TH>Item</TH><TH>Category</TH><TH className="text-right">Price</TH><TH className="text-right">Stock</TH><TH className="text-right">Actions</TH></TR></THead>
            <TBody>
              {data.rows.map((p) => {
                const stock = stockOf(p.id);
                return (
                  <TR key={p.id} className="group">
                    <TD className="font-medium">{p.name}</TD>
                    <TD><Badge variant="info">{p.category.name}</Badge></TD>
                    <TD className="text-right font-semibold">{formatINR(p.mrp)}</TD>
                    <TD className="text-right text-muted-foreground">
                      {!p.trackInventory ? <Badge variant="neutral">Always available</Badge> : stock != null ? `${Number(stock)} ${p.unit}` : '—'}
                    </TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" title="Remove from POS" onClick={() => removeFromPos(p)}><EyeOff className="h-4 w-4 text-warning" /></Button>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8" title="Delete item"
                          onClick={() => del.mutate(p.id, { onSuccess: () => toast.success('Item removed'), onError: (e) => toast.error(apiErrorMessage(e)) })}
                        >
                          <Trash2 className="h-4 w-4 text-danger" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <PosItemFormDialog open={creating || !!editing} onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }} item={editing} />
    </div>
  );
}
