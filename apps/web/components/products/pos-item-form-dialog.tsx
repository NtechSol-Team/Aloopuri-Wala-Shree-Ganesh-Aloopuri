'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Boxes, Infinity as InfinityIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { UNITS, useCategories, useCreateCategory, useSaveProduct, type Category, type MeasurementUnit, type Product } from '@/hooks/useProducts';

const GST_RATES = [0, 5, 12, 18, 28];

function slugSku(name: string): string {
  const base = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return `${base || 'ITEM'}-${Math.floor(100 + Math.random() * 900)}`;
}

const empty = { name: '', categoryId: '', unit: 'PIECE' as MeasurementUnit, price: 0, cost: 0, taxPercent: 5, trackInventory: true };

export function PosItemFormDialog({ open, onOpenChange, item }: { open: boolean; onOpenChange: (v: boolean) => void; item: Product | null }) {
  const { data: categories } = useCategories();
  const createCategory = useCreateCategory();
  const save = useSaveProduct();
  const isEdit = !!item;

  const [form, setForm] = useState({ ...empty });
  const [newCategory, setNewCategory] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const costTouched = useRef(false);
  const skuRef = useRef('');

  useEffect(() => {
    if (!open) return;
    setAddingCategory(false);
    setNewCategory('');
    if (item) {
      costTouched.current = true; // respect the saved value, don't overwrite on price edits
      skuRef.current = item.sku;
      setForm({
        name: item.name, categoryId: item.category.id, unit: item.unit,
        price: Number(item.mrp), cost: Number(item.basePrice), taxPercent: Number(item.taxPercent),
        trackInventory: item.trackInventory,
      });
    } else {
      costTouched.current = false;
      skuRef.current = '';
      setForm({ ...empty, categoryId: categories?.[0]?.id ?? '' });
    }
  }, [open, item, categories]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setPrice = (v: number) => setForm((f) => ({ ...f, price: v, cost: costTouched.current ? f.cost : v }));
  const setCost = (v: number) => { costTouched.current = true; set('cost', v); };

  const addCategory = () => {
    const name = newCategory.trim();
    if (name.length < 2) { toast.error('Enter a category name'); return; }
    createCategory.mutate({ name }, {
      onSuccess: (c: Category) => { set('categoryId', c.id); setNewCategory(''); setAddingCategory(false); toast.success(`Category "${c.name}" added`); },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  const submit = () => {
    if (form.name.trim().length < 2) { toast.error('Enter an item name'); return; }
    if (!form.categoryId) { toast.error('Choose a category'); return; }
    if (form.price <= 0) { toast.error('Enter a price'); return; }

    const sku = isEdit ? skuRef.current : slugSku(form.name);
    save.mutate(
      {
        id: item?.id, name: form.name.trim(), sku, categoryId: form.categoryId, unit: form.unit,
        basePrice: form.cost || form.price, mrp: form.price, taxPercent: form.taxPercent,
        reorderLevel: 0, batchTrackingEnabled: false, isPosEnabled: true, trackInventory: form.trackInventory,
      },
      {
        onSuccess: () => { toast.success(isEdit ? 'POS item updated' : `${form.name} added to POS`); onOpenChange(false); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit POS Item' : 'Add POS Item'}</DialogTitle>
          <DialogDescription>Quick setup for something sellable at the counter — no SKU or catalog detail needed.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label required>Item name</Label>
            <Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Cheese Aloo Puri" />
          </div>

          <div className="space-y-1.5">
            <Label required>Category</Label>
            {addingCategory ? (
              <div className="flex gap-2">
                <Input autoFocus value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Beverages" onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
                <Button type="button" variant="secondary" loading={createCategory.isPending} onClick={addCategory}>Add</Button>
                <Button type="button" variant="ghost" onClick={() => setAddingCategory(false)}>Cancel</Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Select className="flex-1" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
                <Button type="button" variant="secondary" onClick={() => setAddingCategory(true)}><Plus className="h-4 w-4" /> New</Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>Price (₹)</Label>
              <Input type="number" step="0.01" value={form.price} onChange={(e) => setPrice(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>Cost (₹)</Label>
              <Input type="number" step="0.01" value={form.cost} onChange={(e) => setCost(Number(e.target.value))} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select value={form.unit} onChange={(e) => set('unit', e.target.value as MeasurementUnit)}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>GST %</Label>
              <Select value={form.taxPercent} onChange={(e) => set('taxPercent', Number(e.target.value))}>
                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Stock tracking</Label>
            <div className="flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => set('trackInventory', true)}
                className={cn('flex flex-1 items-center justify-center gap-1.5 py-2 text-body font-medium', form.trackInventory ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}
              >
                <Boxes className="h-4 w-4" /> Track stock
              </button>
              <button
                type="button"
                onClick={() => set('trackInventory', false)}
                className={cn('flex flex-1 items-center justify-center gap-1.5 py-2 text-body font-medium', !form.trackInventory ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}
              >
                <InfinityIcon className="h-4 w-4" /> Always available
              </button>
            </div>
            <p className="text-caption text-muted-foreground">
              {form.trackInventory
                ? 'POS checks and reduces finished-goods stock for this item.'
                : 'POS sells this freely, regardless of stock — nothing is checked or reduced (e.g. made-to-order or resold-as-is items).'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>{isEdit ? 'Save' : 'Add to POS'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
