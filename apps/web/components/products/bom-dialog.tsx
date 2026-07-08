'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Boxes, Package } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useBom, useRawMaterials, useProducts, useSaveBom, type BomLineInput, type Product } from '@/hooks/useProducts';

type Row =
  | { componentType: 'RAW_MATERIAL'; rawMaterialId: string; quantity: number }
  | { componentType: 'PRODUCT'; componentProductId: string; quantity: number };

export function BomDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const open = !!product;
  const { data: bom, isLoading } = useBom(product?.id ?? null);
  const { data: materials } = useRawMaterials();
  const { data: productsData } = useProducts();
  const save = useSaveBom(product?.id ?? '');
  const [rows, setRows] = useState<Row[]>([]);

  const rmList = materials?.rows ?? [];
  // A product can be built from any other product (excluding itself); server also guards cycles.
  const componentProducts = (productsData?.rows ?? []).filter((p) => p.id !== product?.id);

  useEffect(() => {
    if (bom) {
      setRows(
        bom.map((b) =>
          b.componentType === 'PRODUCT'
            ? { componentType: 'PRODUCT', componentProductId: b.componentProductId ?? '', quantity: Number(b.quantity) }
            : { componentType: 'RAW_MATERIAL', rawMaterialId: b.rawMaterialId ?? '', quantity: Number(b.quantity) },
        ),
      );
    }
  }, [bom]);

  const rmCost = (id: string) => Number(rmList.find((m) => m.id === id)?.costPerUnit ?? 0);
  const prodCost = (id: string) => Number(componentProducts.find((p) => p.id === id)?.avgCost ?? 0);
  const lineCost = (row: Row) => row.quantity * (row.componentType === 'PRODUCT' ? prodCost(row.componentProductId) : rmCost(row.rawMaterialId));
  const perUnitCost = useMemo(() => rows.reduce((s, r) => s + lineCost(r), 0), [rows, rmList, componentProducts]);

  const addRaw = () => rmList[0] && setRows((r) => [...r, { componentType: 'RAW_MATERIAL', rawMaterialId: rmList[0].id, quantity: 1 }]);
  const addProduct = () => componentProducts[0] && setRows((r) => [...r, { componentType: 'PRODUCT', componentProductId: componentProducts[0].id, quantity: 1 }]);
  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, idx) => (idx === i ? ({ ...row, ...patch } as Row) : row)));
  const remove = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const onSave = () => {
    if (rows.some((r) => r.quantity <= 0)) { toast.error('Quantities must be greater than 0'); return; }
    const items: BomLineInput[] = rows.map((r) =>
      r.componentType === 'PRODUCT'
        ? { componentType: 'PRODUCT', componentProductId: r.componentProductId, quantity: r.quantity }
        : { componentType: 'RAW_MATERIAL', rawMaterialId: r.rawMaterialId, quantity: r.quantity },
    );
    save.mutate(items, {
      onSuccess: () => { toast.success('Recipe saved'); onClose(); },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Recipe — {product?.name}</DialogTitle>
          <DialogDescription>Ingredients consumed to produce one {product?.unit?.toLowerCase()}. Use another product as an ingredient for semi-finished goods (e.g. Khawsa → frozen Khawsa).</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <div className="space-y-2">
            {rows.length === 0 && <p className="py-4 text-center text-body text-muted-foreground">No ingredients yet. Add a raw material or a product below.</p>}
            {rows.length > 0 && <div className="-mx-1 overflow-x-auto px-1 scrollbar-thin"><div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="flex min-w-[440px] items-center gap-2">
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', row.componentType === 'PRODUCT' ? 'bg-primary/10 text-primary' : 'bg-accent text-muted-foreground')} title={row.componentType === 'PRODUCT' ? 'Product component' : 'Raw material'}>
                  {row.componentType === 'PRODUCT' ? <Package className="h-4 w-4" /> : <Boxes className="h-4 w-4" />}
                </span>
                {row.componentType === 'PRODUCT' ? (
                  <Select className="flex-1" value={row.componentProductId} onChange={(e) => update(i, { componentProductId: e.target.value } as Partial<Row>)}>
                    {componentProducts.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit}) · {formatINR(p.avgCost)}/u</option>)}
                  </Select>
                ) : (
                  <Select className="flex-1" value={row.rawMaterialId} onChange={(e) => update(i, { rawMaterialId: e.target.value } as Partial<Row>)}>
                    {rmList.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit}) · {formatINR(m.costPerUnit)}/u</option>)}
                  </Select>
                )}
                <Input type="number" step="0.0001" className="w-24" value={row.quantity} onChange={(e) => update(i, { quantity: Number(e.target.value) })} />
                <span className="w-20 shrink-0 text-right text-caption text-muted-foreground">{formatINR(lineCost(row))}</span>
                <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove"><Trash2 className="h-4 w-4 text-danger" /></Button>
              </div>
            ))}
            </div></div>}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="secondary" size="sm" onClick={addRaw} disabled={rmList.length === 0}><Plus className="h-4 w-4" /> Raw material</Button>
              <Button variant="secondary" size="sm" onClick={addProduct} disabled={componentProducts.length === 0}><Plus className="h-4 w-4" /> Product component</Button>
            </div>

            {rows.length > 0 && (
              <div className="mt-2 flex justify-between rounded-md border border-border bg-surface px-3 py-2 text-body font-semibold">
                <span>Material cost per {product?.unit?.toLowerCase()}</span>
                <span>{formatINR(perUnitCost)}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={onSave} loading={save.isPending}>Save Recipe</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
