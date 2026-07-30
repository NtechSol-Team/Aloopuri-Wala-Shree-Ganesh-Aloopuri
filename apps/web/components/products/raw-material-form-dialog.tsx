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
import { useCategories, useSaveRawMaterial, type RawMaterial } from '@/hooks/useProducts';
import { useUnits, stepFor } from '@/hooks/useUnits';

const schema = z.object({
  name: z.string().min(2, 'Name is required'),
  unitId: z.string().uuid('Select a unit'),
  categoryId: z.string().uuid('Select a category'),
  supplierName: z.string().optional(),
  reorderLevel: z.coerce.number().nonnegative(),
  currentStock: z.coerce.number().nonnegative(),
  costPerUnit: z.coerce.number().nonnegative(),
  hsnCode: z.string().max(20).optional(),
  taxPercent: z.coerce.number().min(0).max(100),
});
type FormValues = z.infer<typeof schema>;

export function RawMaterialFormDialog({
  open,
  onOpenChange,
  material,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  material: RawMaterial | null;
}) {
  const save = useSaveRawMaterial();
  const { data: units } = useUnits();
  // Raw materials only ever belong to a Raw Materials category.
  const { data: categories } = useCategories({ type: 'RAW_MATERIAL' });
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const unitList = units ?? [];
  const catList = categories ?? [];
  const selectedUnitId = watch('unitId');
  // Quantity inputs step by whatever precision the chosen unit permits — the
  // backend enforces the same limit, so this keeps the UI from offering invalid values.
  const decimals = useMemo(
    () => unitList.find((u) => u.id === selectedUnitId)?.decimalPlaces ?? 2,
    [unitList, selectedUnitId],
  );

  useEffect(() => {
    if (!open) return;
    reset(
      material
        ? {
            name: material.name, unitId: material.unit.id, categoryId: material.category?.id ?? '',
            supplierName: material.supplierName ?? '',
            reorderLevel: Number(material.reorderLevel), currentStock: Number(material.currentStock), costPerUnit: Number(material.costPerUnit),
            hsnCode: material.hsnCode ?? '', taxPercent: Number(material.taxPercent),
          }
        : {
            name: '', unitId: unitList[0]?.id ?? '', categoryId: catList[0]?.id ?? '', supplierName: '',
            reorderLevel: 0, currentStock: 0, costPerUnit: 0, hsnCode: '', taxPercent: 0,
          },
    );
    // unitList/catList are only used to seed defaults for a brand-new material.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, material, reset]);

  const onSubmit = (values: FormValues) =>
    save.mutate(
      { id: material?.id, ...values },
      {
        onSuccess: () => {
          toast.success(material ? 'Raw material updated' : 'Raw material created');
          onOpenChange(false);
        },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{material ? 'Edit Raw Material' : 'Add Raw Material'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Name</Label>
              <Input {...register('name')} aria-invalid={!!errors.name} />
              {errors.name && <p className="text-caption text-danger">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select {...register('categoryId')} aria-invalid={!!errors.categoryId}>
                {!catList.length && <option value="">No raw-material categories yet</option>}
                {catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              {errors.categoryId && <p className="text-caption text-danger">{errors.categoryId.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Unit</Label>
              <Select {...register('unitId')} aria-invalid={!!errors.unitId}>
                {!unitList.length && <option value="">No units yet</option>}
                {unitList.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
              {errors.unitId && <p className="text-caption text-danger">{errors.unitId.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Input {...register('supplierName')} />
            </div>
            <div className="space-y-1.5">
              <Label>Current Stock</Label>
              <Input type="number" step={stepFor(decimals)} {...register('currentStock')} />
            </div>
            <div className="space-y-1.5">
              <Label>Reorder Level</Label>
              <Input type="number" step={stepFor(decimals)} {...register('reorderLevel')} />
            </div>
            <div className="space-y-1.5">
              <Label>Cost / Unit (₹)</Label>
              <Input type="number" step="0.01" {...register('costPerUnit')} />
            </div>
            <div className="space-y-1.5">
              <Label>HSN Code</Label>
              <Input {...register('hsnCode')} />
            </div>
            <div className="space-y-1.5">
              <Label>GST (%)</Label>
              <Input type="number" step="0.01" {...register('taxPercent')} aria-invalid={!!errors.taxPercent} />
              {errors.taxPercent && <p className="text-caption text-danger">{errors.taxPercent.message}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{material ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
