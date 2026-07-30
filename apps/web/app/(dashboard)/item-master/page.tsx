'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Ruler, Tags } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import {
  useCategories, useSaveCategory, useDeleteCategory,
  CATEGORY_TYPE_LABEL, type Category, type CategoryType,
} from '@/hooks/useProducts';
import { useUnits, useSaveUnit, useDeleteUnit, type Unit } from '@/hooks/useUnits';

type Tab = 'categories' | 'units';

const TABS: Array<[Tab, string]> = [
  ['categories', 'Category Master'],
  ['units', 'Unit Master'],
];

export default function ItemMasterPage() {
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
    </div>
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
