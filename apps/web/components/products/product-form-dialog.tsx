'use client';

import { useEffect, useMemo } from 'react';
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
import { formatQty } from '@/lib/utils';
import { useSaveProduct, type Category, type Product } from '@/hooks/useProducts';
import { useUnits, stepFor } from '@/hooks/useUnits';

const schema = z.object({
  name: z.string().min(2, 'Name is required'),
  sku: z.string().min(2, 'SKU is required'),
  categoryId: z.string().uuid('Select a category'),
  unitId: z.string().uuid('Select a unit'),
  basePrice: z.coerce.number().nonnegative(),
  mrp: z.coerce.number().nonnegative(),
  taxPercent: z.coerce.number().min(0).max(100),
  reorderLevel: z.coerce.number().nonnegative(),
  openingStock: z.coerce.number().nonnegative(),
  addStock: z.coerce.number().nonnegative(),
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
  const { data: units } = useUnits();
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { taxPercent: 5, basePrice: 0, mrp: 0, reorderLevel: 0, openingStock: 0, addStock: 0, batchTrackingEnabled: true, isPosEnabled: false, trackInventory: true },
  });

  const unitList = units ?? [];
  const selectedUnitId = watch('unitId');
  // Reorder level steps by the chosen unit's own precision (Item Master setting).
  const decimals = useMemo(
    () => unitList.find((u) => u.id === selectedUnitId)?.decimalPlaces ?? 2,
    [unitList, selectedUnitId],
  );

  useEffect(() => {
    if (open) {
      reset(
        product
          ? {
              name: product.name, sku: product.sku, categoryId: product.category.id, unitId: product.unit.id,
              basePrice: Number(product.basePrice), mrp: Number(product.mrp), taxPercent: Number(product.taxPercent),
              reorderLevel: Number(product.reorderLevel), openingStock: 0, addStock: 0, batchTrackingEnabled: product.batchTrackingEnabled,
              isPosEnabled: product.isPosEnabled, trackInventory: product.trackInventory,
            }
          : { name: '', sku: '', categoryId: categories[0]?.id ?? '', unitId: unitList[0]?.id ?? '', basePrice: 0, mrp: 0, taxPercent: 5, reorderLevel: 0, openingStock: 0, addStock: 0, batchTrackingEnabled: true, isPosEnabled: false, trackInventory: true },
      );
    }
    // unitList only seeds the default for a brand-new product.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product, categories, reset]);

  const onSubmit = (values: FormValues) => {
    // openingStock is create-only, addStock is edit-only — each is hidden on the
    // other mode and the server would ignore it anyway, but there's no reason to
    // send a value the user never saw or acted on.
    const { openingStock, addStock, ...rest } = values;
    save.mutate(
      { id: product?.id, ...rest, ...(product ? { addStock } : { openingStock }) },
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
            <Field label="Unit" error={errors.unitId?.message}>
              <Select {...register('unitId')} aria-invalid={!!errors.unitId}>
                {!unitList.length && <option value="">No units yet</option>}
                {unitList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
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
              <Input type="number" step={stepFor(decimals)} {...register('reorderLevel')} />
            </Field>
            {!product && (
              <Field
                label="Opening Stock"
                error={errors.openingStock?.message}
                hint="Added to Godown stock on creation. Manage stock afterwards from Inventory."
              >
                <Input type="number" step={stepFor(decimals)} {...register('openingStock')} />
              </Field>
            )}
            {product && (
              <Field
                label="Add Stock"
                error={errors.addStock?.message}
                hint={`Current Godown stock: ${formatQty(product.godownStock.quantity, decimals)} ${product.unit.name}. Adds on top — leave at 0 to make no change.`}
              >
                <Input type="number" step={stepFor(decimals)} {...register('addStock')} />
              </Field>
            )}
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

function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-caption text-danger">{error}</p>}
      {!error && hint && <p className="text-caption text-muted-foreground">{hint}</p>}
    </div>
  );
}
