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
import { UNITS, useSaveRawMaterial, type RawMaterial } from '@/hooks/useProducts';

const schema = z.object({
  name: z.string().min(2, 'Name is required'),
  unit: z.enum(['KG', 'GRAM', 'LITRE', 'ML', 'PIECE', 'PACKET', 'BOX', 'DOZEN']),
  supplierName: z.string().optional(),
  reorderLevel: z.coerce.number().nonnegative(),
  currentStock: z.coerce.number().nonnegative(),
  costPerUnit: z.coerce.number().nonnegative(),
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
  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset(
        material
          ? {
              name: material.name, unit: material.unit, supplierName: material.supplierName ?? '',
              reorderLevel: Number(material.reorderLevel), currentStock: Number(material.currentStock), costPerUnit: Number(material.costPerUnit),
            }
          : { name: '', unit: 'KG', supplierName: '', reorderLevel: 0, currentStock: 0, costPerUnit: 0 },
      );
    }
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
              <Label>Unit</Label>
              <Select {...register('unit')}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</Select>
            </div>
            <div className="space-y-1.5">
              <Label>Supplier</Label>
              <Input {...register('supplierName')} />
            </div>
            <div className="space-y-1.5">
              <Label>Current Stock</Label>
              <Input type="number" step="0.01" {...register('currentStock')} />
            </div>
            <div className="space-y-1.5">
              <Label>Reorder Level</Label>
              <Input type="number" step="0.01" {...register('reorderLevel')} />
            </div>
            <div className="space-y-1.5">
              <Label>Cost / Unit (₹)</Label>
              <Input type="number" step="0.01" {...register('costPerUnit')} />
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
