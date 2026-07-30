'use client';

import { useDeferredValue, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, ListTree, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import {
  useCategories, useProducts, useDeleteProduct,
  type Product,
} from '@/hooks/useProducts';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import { BomDialog } from '@/components/products/bom-dialog';

// Categories moved out to Item Master → Category Master (they're shared with raw
// materials now and need full edit/delete, which the old inline tab never had).
export default function ProductsPage() {
  return (
    <div className="space-y-5">
      <ProductsTab />
    </div>
  );
}

function ProductsTab() {
  const [search, setSearch] = useState('');
  // Deferred so a fast typist doesn't fire a fresh (cache-missing) API request
  // per keystroke — the list only refetches once typing settles.
  const deferredSearch = useDeferredValue(search);
  // Catalog products only — POS counter items live on their own "POS Items" page.
  const { data, isLoading } = useProducts({ search: deferredSearch || undefined, isPosEnabled: false });
  // Products file under Finished Goods categories only (raw-material ones live
  // on the Item Master page and apply to raw materials).
  const { data: categories } = useCategories({ type: 'FINISHED_GOODS' });
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [bomProduct, setBomProduct] = useState<Product | null>(null);
  const del = useDeleteProduct();

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search products or SKU..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add Product</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !data?.rows.length ? (
        <Empty text="No products yet." action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add first product</Button>} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Product</TH><TH>SKU</TH><TH>Category</TH><TH>Unit</TH>
              <TH className="text-right">Avg Cost</TH><TH className="text-right">Base</TH><TH className="text-right">MRP</TH><TH className="text-right">Tax</TH>
              <TH>Status</TH><TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {data.rows.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.name}</TD>
                <TD className="text-muted-foreground">{p.sku}</TD>
                <TD>{p.category.name}</TD>
                <TD>{p.unit.name}</TD>
                <TD className="text-right">{Number(p.avgCost) > 0 ? formatINR(p.avgCost) : <span className="text-muted-foreground">—</span>}</TD>
                <TD className="text-right">{formatINR(p.basePrice)}</TD>
                <TD className="text-right">{formatINR(p.mrp)}</TD>
                <TD className="text-right">{Number(p.taxPercent)}%</TD>
                <TD><Badge variant={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Active' : 'Inactive'}</Badge></TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Bill of materials" onClick={() => setBomProduct(p)}><ListTree className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditing(p)}><Pencil className="h-4 w-4" /></Button>
                    <Button
                      variant="ghost" size="icon" title="Deactivate"
                      onClick={() => del.mutate(p.id, { onSuccess: () => toast.success('Product deactivated'), onError: (e) => toast.error(apiErrorMessage(e)) })}
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

      <ProductFormDialog open={creating || !!editing} onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }} product={editing} categories={categories ?? []} />
      <BomDialog product={bomProduct} onClose={() => setBomProduct(null)} />
    </Card>
  );
}

function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-body text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}
