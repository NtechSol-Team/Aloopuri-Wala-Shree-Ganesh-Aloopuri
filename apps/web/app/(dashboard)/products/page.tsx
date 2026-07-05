'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, ListTree, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import {
  useCategories, useCreateCategory, useProducts, useDeleteProduct, useSaveProduct,
  type Product,
} from '@/hooks/useProducts';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import { BomDialog } from '@/components/products/bom-dialog';

type Tab = 'products' | 'categories';

export default function ProductsPage() {
  const [tab, setTab] = useState<Tab>('products');

  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-border">
        {([['products', 'Products'], ['categories', 'Categories']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'border-b-2 px-4 py-2 text-body font-medium transition-colors',
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'products' && <ProductsTab />}
      {tab === 'categories' && <CategoriesTab />}
    </div>
  );
}

function ProductsTab() {
  const [search, setSearch] = useState('');
  const { data, isLoading } = useProducts({ search: search || undefined });
  const { data: categories } = useCategories();
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [bomProduct, setBomProduct] = useState<Product | null>(null);
  const del = useDeleteProduct();
  const save = useSaveProduct();

  const togglePos = (p: Product) => {
    save.mutate(
      { id: p.id, isPosEnabled: !p.isPosEnabled },
      {
        onSuccess: () => toast.success(p.isPosEnabled ? `${p.name} hidden from POS` : `${p.name} now sellable at POS`),
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4">
        <div className="relative w-72 max-w-full">
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
              <TH className="text-right">Base</TH><TH className="text-right">MRP</TH><TH className="text-right">Tax</TH>
              <TH>Status</TH><TH>POS</TH><TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {data.rows.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.name}</TD>
                <TD className="text-muted-foreground">{p.sku}</TD>
                <TD>{p.category.name}</TD>
                <TD>{p.unit}</TD>
                <TD className="text-right">{formatINR(p.basePrice)}</TD>
                <TD className="text-right">{formatINR(p.mrp)}</TD>
                <TD className="text-right">{Number(p.taxPercent)}%</TD>
                <TD><Badge variant={p.isActive ? 'success' : 'neutral'}>{p.isActive ? 'Active' : 'Inactive'}</Badge></TD>
                <TD>
                  <button onClick={() => togglePos(p)} title="Click to toggle POS availability">
                    <Badge variant={p.isPosEnabled ? 'success' : 'neutral'}>{p.isPosEnabled ? 'POS' : 'Hidden'}</Badge>
                  </button>
                </TD>
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

function CategoriesTab() {
  const { data, isLoading } = useCategories();
  const create = useCreateCategory();
  const [name, setName] = useState('');

  const add = () => {
    if (name.trim().length < 2) return;
    create.mutate({ name: name.trim() }, {
      onSuccess: () => { toast.success('Category added'); setName(''); },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <Card className="p-4">
      <div className="mb-4 flex gap-2">
        <Input placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button onClick={add} loading={create.isPending}><Plus className="h-4 w-4" /> Add</Button>
      </div>
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="font-medium">{c.name}</span>
              <Badge variant="info">{c._count?.products ?? 0} products</Badge>
            </div>
          ))}
        </div>
      )}
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
