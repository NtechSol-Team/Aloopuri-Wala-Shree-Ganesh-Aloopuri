'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import toast from 'react-hot-toast';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiErrorMessage } from '@/lib/api';
import { UNITS, useSaveProduct, type Category, type Product } from '@/hooks/useProducts';

const schema = z.object({
  name: z.string().min(2, 'Name is required'),
  sku: z.string().min(2, 'SKU is required'),
  categoryId: z.string().uuid('Select a category'),
  unit: z.enum(['KG', 'GRAM', 'LITRE', 'ML', 'PIECE', 'PACKET', 'BOX', 'DOZEN']),
  basePrice: z.coerce.number().nonnegative(),
  mrp: z.coerce.number().nonnegative(),
  taxPercent: z.coerce.number().min(0).max(100),
  reorderLevel: z.coerce.number().nonnegative(),
  batchTrackingEnabled: z.boolean(),
  isPosEnabled: z.boolean(),
  trackInventory: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  categories,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: Product | null;
  categories: Category[];
}) {
  const save = useSaveProduct();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { unit: 'PACKET', taxPercent: 5, basePrice: 0, mrp: 0, reorderLevel: 0, batchTrackingEnabled: true, isPosEnabled: false, trackInventory: true },
  });

  useEffect(() => {
    if (open) {
      reset(
        product
          ? {
              name: product.name, sku: product.sku, categoryId: product.category.id, unit: product.unit,
              basePrice: Number(product.basePrice), mrp: Number(product.mrp), taxPercent: Number(product.taxPercent),
              reorderLevel: Number(product.reorderLevel), batchTrackingEnabled: product.batchTrackingEnabled,
              isPosEnabled: product.isPosEnabled, trackInventory: product.trackInventory,
            }
          : { name: '', sku: '', categoryId: categories[0]?.id ?? '', unit: 'PACKET', basePrice: 0, mrp: 0, taxPercent: 5, reorderLevel: 0, batchTrackingEnabled: true, isPosEnabled: false, trackInventory: true },
      );
    }
  }, [open, product, categories, reset]);

  const onSubmit = (values: FormValues) => {
    save.mutate(
      { id: product?.id, ...values },
      {
        onSuccess: () => {
          toast.success(product ? 'Product updated' : 'Product created');
          onOpenChange(false);
        },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{product ? 'Edit Product' : 'Add Product'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Name" error={errors.name?.message} className="sm:col-span-2">
              <Input {...register('name')} aria-invalid={!!errors.name} />
            </Field>
            <Field label="SKU" error={errors.sku?.message}>
              <Input {...register('sku')} aria-invalid={!!errors.sku} />
            </Field>
            <Field label="Category" error={errors.categoryId?.message}>
              <Select {...register('categoryId')} aria-invalid={!!errors.categoryId}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Unit">
              <Select {...register('unit')}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
            <Field label="Tax %">
              <Input type="number" step="0.01" {...register('taxPercent')} />
            </Field>
            <Field label="Base Price (₹)">
              <Input type="number" step="0.01" {...register('basePrice')} />
            </Field>
            <Field label="MRP (₹)">
              <Input type="number" step="0.01" {...register('mrp')} />
            </Field>
            <Field label="Reorder Level">
              <Input type="number" step="0.01" {...register('reorderLevel')} />
            </Field>
            <label className="sm:col-span-2 flex items-center gap-2 text-body">
              <input type="checkbox" {...register('batchTrackingEnabled')} className="h-4 w-4" />
              Enable batch tracking
            </label>
            <label className="sm:col-span-2 flex items-center gap-2 text-body">
              <input type="checkbox" {...register('isPosEnabled')} className="h-4 w-4" />
              Sellable at POS counter
            </label>
            <label className="sm:col-span-2 flex items-center gap-2 text-body">
              <input type="checkbox" {...register('trackInventory')} className="h-4 w-4" />
              Track finished-goods stock <span className="text-caption text-muted-foreground">(off = POS sells it without checking or reducing stock)</span>
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{product ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-caption text-danger">{error}</p>}
    </div>
  );
}
