'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Ruler, Tags, ListTree, Search, Store } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import {
  useCategories, useSaveCategory, useDeleteCategory, useProducts, useDeleteProduct,
  CATEGORY_TYPE_LABEL, type Category, type CategoryType, type Product,
} from '@/hooks/useProducts';
import { useUnits, useSaveUnit, useDeleteUnit, type Unit } from '@/hooks/useUnits';
import { ProductFormDialog } from '@/components/products/product-form-dialog';
import { BomDialog } from '@/components/products/bom-dialog';

type Tab = 'categories' | 'units' | 'products';

export default function ItemMasterPage() {
  const role = useAuthStore((s) => s.user?.role);
  // Products management stays owner-only, same as when it lived on its own page —
  // moving it under Item Master is just relocating the entry point.
  const showProducts = role === 'SUPER_ADMIN';

  const TABS: Array<[Tab, string]> = [
    ['categories', 'Category Master'],
    ['units', 'Unit Master'],
    ...(showProducts ? [['products', 'Products'] as [Tab, string]] : []),
  ];

  const [tab, setTab] = useState<Tab>('categories');

  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-border">
        {TABS.map(([key, label]) => (
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

      {tab === 'categories' && <CategoriesTab />}
      {tab === 'units' && <UnitsTab />}
      {tab === 'products' && showProducts && <ProductsTab />}
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
  // under Category Master and apply to raw materials).
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
        <Empty icon={Store} text="No products yet." action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add first product</Button>} />
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

// ───────────────────────────── Category Master ──────────────────────────────
function CategoriesTab() {
  const { data, isLoading } = useCategories();
  const del = useDeleteCategory();
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  const remove = (c: Category) => {
    if (!window.confirm(`Delete the category "${c.name}"?`)) return;
    del.mutate(c.id, {
      onSuccess: () => toast.success('Category deleted'),
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body text-muted-foreground">
          Group items by category. Finished Goods categories apply to products; Raw Materials categories apply to raw materials.
        </p>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add Category</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !data?.length ? (
        <Empty
          icon={Tags}
          text="No categories yet."
          action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add first category</Button>}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Category</TH><TH>Type</TH><TH className="text-right">Items</TH><TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {data.map((c) => {
              const items = (c._count?.products ?? 0) + (c._count?.rawMaterials ?? 0);
              return (
                <TR key={c.id}>
                  <TD className="font-medium">
                    {c.name}
                    {c.description && <span className="ml-1.5 text-caption text-muted-foreground">{c.description}</span>}
                  </TD>
                  <TD>
                    <Badge variant={c.type === 'FINISHED_GOODS' ? 'info' : 'neutral'}>{CATEGORY_TYPE_LABEL[c.type]}</Badge>
                  </TD>
                  <TD className="text-right">{items}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <CategoryFormDialog
        open={creating || !!editing}
        onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }}
        category={editing}
      />
    </Card>
  );
}

function CategoryFormDialog({ open, onOpenChange, category }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  category: Category | null;
}) {
  const save = useSaveCategory();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<CategoryType>('FINISHED_GOODS');

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? '');
    setDescription(category?.description ?? '');
    setType(category?.type ?? 'FINISHED_GOODS');
  }, [open, category]);

  const submit = () => {
    if (name.trim().length < 2) { toast.error('Enter a category name'); return; }
    save.mutate(
      { id: category?.id, name: name.trim(), description: description.trim() || undefined, type },
      {
        onSuccess: () => { toast.success(category ? 'Category updated' : 'Category created'); onOpenChange(false); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{category ? 'Edit Category' : 'Add Category'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onChange={(e) => setType(e.target.value as CategoryType)}>
              <option value="FINISHED_GOODS">{CATEGORY_TYPE_LABEL.FINISHED_GOODS}</option>
              <option value="RAW_MATERIAL">{CATEGORY_TYPE_LABEL.RAW_MATERIAL}</option>
            </Select>
            <p className="text-caption text-muted-foreground">Decides whether products or raw materials can be filed under it.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>{category ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────── Unit Master ────────────────────────────────
function UnitsTab() {
  const { data, isLoading } = useUnits();
  const del = useDeleteUnit();
  const [editing, setEditing] = useState<Unit | null>(null);
  const [creating, setCreating] = useState(false);

  const remove = (u: Unit) => {
    if (!window.confirm(`Delete the unit "${u.name}"?`)) return;
    del.mutate(u.id, {
      onSuccess: () => toast.success('Unit deleted'),
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body text-muted-foreground">
          Measurement units and how precisely each one is counted. The decimal setting applies everywhere quantities are entered or shown.
        </p>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add Unit</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !data?.length ? (
        <Empty
          icon={Ruler}
          text="No units yet."
          action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add first unit</Button>}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Unit</TH><TH>Decimals</TH><TH>Example</TH><TH className="text-right">Used by</TH><TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {data.map((u) => {
              const used = (u._count?.products ?? 0) + (u._count?.rawMaterials ?? 0) + (u._count?.menuItems ?? 0);
              return (
                <TR key={u.id}>
                  <TD className="font-medium">{u.name}</TD>
                  <TD>{u.decimalPlaces}</TD>
                  <TD className="text-muted-foreground">{(1).toFixed(u.decimalPlaces)}</TD>
                  <TD className="text-right">{used ? `${used} item(s)` : <span className="text-muted-foreground">—</span>}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditing(u)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => remove(u)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <UnitFormDialog
        open={creating || !!editing}
        onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }}
        unit={editing}
      />
    </Card>
  );
}

function UnitFormDialog({ open, onOpenChange, unit }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  unit: Unit | null;
}) {
  const save = useSaveUnit();
  const [name, setName] = useState('');
  const [decimalPlaces, setDecimalPlaces] = useState(0);

  useEffect(() => {
    if (!open) return;
    setName(unit?.name ?? '');
    setDecimalPlaces(unit?.decimalPlaces ?? 0);
  }, [open, unit]);

  const submit = () => {
    if (!name.trim()) { toast.error('Enter a unit name'); return; }
    save.mutate(
      { id: unit?.id, name: name.trim(), decimalPlaces },
      {
        onSuccess: () => { toast.success(unit ? 'Unit updated' : 'Unit created'); onOpenChange(false); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{unit ? 'Edit Unit' : 'Add Unit'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input placeholder="Kg, Meter, Roll, Piece…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          </div>
          <div className="space-y-1.5">
            <Label>Decimal places</Label>
            <Select value={String(decimalPlaces)} onChange={(e) => setDecimalPlaces(Number(e.target.value))}>
              {[0, 1, 2, 3, 4].map((d) => (
                <option key={d} value={d}>{d} — e.g. {(1).toFixed(d)}</option>
              ))}
            </Select>
            <p className="text-caption text-muted-foreground">
              How many decimals a quantity in this unit may have. Whole-count units like Piece or Box use 0; part-measured
              units like Kg or Litre need more. Applied across inventory, purchases, production and sales.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>{unit ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Empty({ icon: Icon, text, action }: { icon: typeof Ruler; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" />
      <p className="text-body text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}
