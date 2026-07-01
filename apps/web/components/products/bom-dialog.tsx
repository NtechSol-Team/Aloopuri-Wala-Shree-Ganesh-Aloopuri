'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { apiErrorMessage } from '@/lib/api';
import { useBom, useRawMaterials, useSaveBom, type Product } from '@/hooks/useProducts';

interface Row {
  rawMaterialId: string;
  quantity: number;
}

export function BomDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const open = !!product;
  const { data: bom, isLoading } = useBom(product?.id ?? null);
  const { data: materials } = useRawMaterials();
  const save = useSaveBom(product?.id ?? '');
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (bom) setRows(bom.map((b) => ({ rawMaterialId: b.rawMaterialId, quantity: Number(b.quantity) })));
  }, [bom]);

  const rmList = materials?.rows ?? [];
  const addRow = () => rmList[0] && setRows((r) => [...r, { rawMaterialId: rmList[0].id, quantity: 1 }]);
  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const remove = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const onSave = () => {
    if (rows.some((r) => r.quantity <= 0)) {
      toast.error('Quantities must be greater than 0');
      return;
    }
    save.mutate(rows, {
      onSuccess: () => {
        toast.success('Bill of materials saved');
        onClose();
      },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bill of Materials — {product?.name}</DialogTitle>
          <DialogDescription>Raw materials consumed to produce one {product?.unit?.toLowerCase()}.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <div className="space-y-2">
            {rows.length === 0 && <p className="py-4 text-center text-body text-muted-foreground">No materials yet. Add the first one.</p>}
            {rows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select className="flex-1" value={row.rawMaterialId} onChange={(e) => update(i, { rawMaterialId: e.target.value })}>
                  {rmList.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}
                </Select>
                <Input
                  type="number"
                  step="0.0001"
                  className="w-28"
                  value={row.quantity}
                  onChange={(e) => update(i, { quantity: Number(e.target.value) })}
                />
                <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove">
                  <Trash2 className="h-4 w-4 text-danger" />
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={addRow} disabled={rmList.length === 0}>
              <Plus className="h-4 w-4" /> Add material
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} loading={save.isPending}>Save BOM</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
