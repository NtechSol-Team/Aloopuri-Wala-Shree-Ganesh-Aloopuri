'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ImagePlus, X } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import {
  useSaveMenuItem, useUploadMenuItemPhoto, useRemoveMenuItemPhoto,
  type MenuCategory, type MenuItem, type MeasurementUnit,
} from '@/hooks/useMenus';
import { productImageSrc } from '@/lib/menu-images';

const UNITS: MeasurementUnit[] = ['PIECE', 'KG', 'GRAM', 'LITRE', 'ML', 'PACKET', 'BOX', 'DOZEN'];
const GST_RATES = [0, 5, 12, 18, 28];

const empty = { name: '', categoryId: '' as string, unit: 'PIECE' as MeasurementUnit, price: 0, taxPercent: 5, isAvailable: true };

/** Add/edit a single item inside one menu. Prices, category, tax etc are this
 *  menu's own — editing here never affects any other menu. */
export function MenuItemFormDialog({
  menuId, categories, item, open, onOpenChange,
}: {
  menuId: string;
  categories: MenuCategory[];
  item: MenuItem | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const save = useSaveMenuItem(menuId);
  const uploadPhoto = useUploadMenuItemPhoto(menuId);
  const removePhoto = useRemoveMenuItemPhoto(menuId);
  const isEdit = !!item;

  const [form, setForm] = useState({ ...empty });
  const photoRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPhotoFile(null); setPhotoPreview(null); setPhotoRemoved(false);
    if (item) {
      setForm({
        name: item.name, categoryId: item.categoryId ?? '', unit: item.unit,
        price: Number(item.price), taxPercent: Number(item.taxPercent), isAvailable: item.isAvailable,
      });
    } else {
      setForm({ ...empty, categoryId: categories[0]?.id ?? '' });
    }
  }, [open, item, categories]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const pickPhoto = (file: File | null) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast.error('Choose a JPG, PNG or WebP image'); return; }
    setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); setPhotoRemoved(false);
  };
  const clearPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (photoFile) { setPhotoFile(null); setPhotoPreview(null); }
    else if (item) setPhotoRemoved(true);
  };

  const photoDisplay = photoPreview ?? (item ? productImageSrc(photoRemoved ? { ...item, photoUrl: '' } : item) : null);
  const canClearPhoto = !!photoFile || (!!photoDisplay && !photoRemoved);

  const submit = () => {
    if (form.name.trim().length < 1) { toast.error('Enter an item name'); return; }
    if (form.price <= 0) { toast.error('Enter a price'); return; }
    save.mutate(
      {
        id: item?.id, name: form.name.trim(), categoryId: form.categoryId || null,
        unit: form.unit, price: form.price, taxPercent: form.taxPercent, isAvailable: form.isAvailable,
      },
      {
        onSuccess: async (saved) => {
          if (photoFile) {
            try { await uploadPhoto.mutateAsync({ id: saved.id, file: photoFile }); }
            catch (e) { toast.error(`Item saved, but photo upload failed: ${apiErrorMessage(e)}`); onOpenChange(false); return; }
          } else if (photoRemoved) {
            try { await removePhoto.mutateAsync(saved.id); }
            catch (e) { toast.error(`Item saved, but photo removal failed: ${apiErrorMessage(e)}`); onOpenChange(false); return; }
          }
          toast.success(isEdit ? 'Item updated' : `${form.name} added`);
          onOpenChange(false);
        },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Item' : 'Add Item'}</DialogTitle>
          <DialogDescription>This item&apos;s price and details belong to this menu only.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => photoRef.current?.click()}
              className="group relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl border border-border bg-surface"
              title="Set item photo"
            >
              {photoDisplay ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoDisplay} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-muted-foreground">
                  <ImagePlus className="h-5 w-5" /><span className="text-[9px] font-semibold">Photo</span>
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[9px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                {photoDisplay ? 'Change' : 'Add'}
              </span>
              {canClearPhoto && (
                <span
                  role="button" tabIndex={0} onClick={clearPhoto}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') clearPhoto(e as unknown as React.MouseEvent); }}
                  title="Remove photo"
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-danger"
                >
                  <X className="h-3 w-3" />
                </span>
              )}
            </button>
            <input ref={photoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)} />
            <div className="flex-1 space-y-1.5">
              <Label required>Item name</Label>
              <Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Cheese Aloo Puri" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">— Uncategorised —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>Price (₹)</Label>
              <Input type="number" step="0.01" value={form.price} onChange={(e) => set('price', Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label>GST %</Label>
              <Select value={form.taxPercent} onChange={(e) => set('taxPercent', Number(e.target.value))}>
                {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
              </Select>
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
              <Label>Availability</Label>
              <div className="flex overflow-hidden rounded-md border border-border">
                <button type="button" onClick={() => set('isAvailable', true)} className={cn('flex-1 py-2 text-body font-medium', form.isAvailable ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>Available</button>
                <button type="button" onClick={() => set('isAvailable', false)} className={cn('flex-1 py-2 text-body font-medium', !form.isAvailable ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground')}>Hidden</button>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>{isEdit ? 'Save' : 'Add'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
