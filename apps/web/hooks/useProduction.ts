'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export interface ProductionBatch {
  id: string;
  batchNumber: string;
  quantityProduced: string;
  totalMaterialCost: string;
  overheadCost: string;
  costPerUnit: string;
  productionDate: string;
  notes: string | null;
  product: { id: string; name: string; unit: string };
}

export interface IntakeRecord {
  id: string;
  quantity: string;
  costPerUnit: string;
  totalCost: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  intakeDate: string;
  rawMaterial: { name: string; unit: string };
}

export interface GodownStockRow {
  quantity: string;
  product: { id: string; name: string; sku: string; unit: string; reorderLevel: string };
}

export function useBatches() {
  return useQuery({
    queryKey: ['production', 'batches'],
    queryFn: async () => (await api.get<ApiSuccess<ProductionBatch[]>>('/production/batches', { params: { limit: 100 } })).data.data,
  });
}

export function useLogBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      productId: string; quantityProduced: number; productionDate?: string; notes?: string;
      overheads?: Array<{ label: string; amount: number }>;
      ingredients?: Array<{ bomItemId: string; quantity: number; unitCost: number }>;
    }) => (await api.post<ApiSuccess<ProductionBatch>>('/production/batches', input)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production'] });
      qc.invalidateQueries({ queryKey: ['raw-materials'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useIntake() {
  return useQuery({
    queryKey: ['production', 'intake'],
    queryFn: async () => (await api.get<ApiSuccess<IntakeRecord[]>>('/production/intake', { params: { limit: 100 } })).data.data,
  });
}

export function useLogIntake() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      rawMaterialId: string; quantity: number; costPerUnit: number; supplierName?: string; invoiceNumber?: string; notes?: string;
    }) => (await api.post<ApiSuccess<IntakeRecord>>('/production/intake', input)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['production'] });
      qc.invalidateQueries({ queryKey: ['raw-materials'] });
    },
  });
}

export function useGodownStock() {
  return useQuery({
    queryKey: ['production', 'godown-stock'],
    queryFn: async () => (await api.get<ApiSuccess<GodownStockRow[]>>('/production/godown-stock')).data.data,
  });
}

export type PurchaseLineKind = 'RAW_MATERIAL' | 'FINISHED_GOOD' | 'OTHER';

export interface PurchaseBill {
  id: string;
  billNumber: string;
  supplierName: string | null;
  supplierGstin: string | null;
  invoiceNumber: string | null;
  billDate: string;
  taxableAmount: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;
  balanceDue: string;
  status: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID';
  creditDays: number | null;
  dueDate: string | null;
  isGstBill: boolean;
  _count: { items: number };
}

export interface PurchaseBillItem {
  id: string;
  kind: PurchaseLineKind;
  refId: string | null;
  name: string;
  hsnCode: string | null;
  quantity: string | null;
  unitCost: string | null;
  taxRate: string;
  taxableAmount: string;
  taxAmount: string;
  lineTotal: string;
}
export interface PurchaseBillDetail extends Omit<PurchaseBill, '_count'> {
  cgst: string; sgst: string; igst: string; paymentMethod: string | null; notes: string | null;
  items: PurchaseBillItem[];
  payments: Array<{ id: string; paymentNumber: string; amount: string; method: string; paymentDate: string }>;
}

export type PurchaseItemInput =
  | { kind: 'RAW_MATERIAL'; rawMaterialId: string; quantity: number; costPerUnit: number; taxRate: number; hsnCode?: string }
  | { kind: 'FINISHED_GOOD'; productId: string; quantity: number; costPerUnit: number; taxRate: number; hsnCode?: string }
  | { kind: 'OTHER'; categoryId: string; description?: string; amount: number; taxRate: number; hsnCode?: string };

export function usePurchases(params: { status?: string; search?: string } = {}) {
  return useQuery({
    queryKey: ['production', 'purchases', params],
    queryFn: async () => (await api.get<ApiSuccess<PurchaseBill[]>>('/production/purchases', { params })).data.data,
  });
}

export function usePurchaseDetail(id: string | null) {
  return useQuery({
    queryKey: ['production', 'purchase', id],
    enabled: !!id,
    queryFn: async () => (await api.get<ApiSuccess<PurchaseBillDetail>>(`/production/purchases/${id}`)).data.data,
  });
}

export interface PurchaseInput {
  supplierName?: string; supplierGstin?: string; invoiceNumber?: string; notes?: string; paymentMethod?: string; amountPaidNow?: number;
  intakeDate?: string; creditDays?: number; isGstBill?: boolean;
  items: PurchaseItemInput[];
}
type PurchaseResult = { billNumber: string; totalCost: string; amountPaid: string; balanceDue: string; status: string; lineCount: number };

export function useRecordPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PurchaseInput) => (await api.post<ApiSuccess<PurchaseResult>>('/production/purchases', input)).data.data,
    onSuccess: () => {
      ['production', 'raw-materials', 'expenses', 'expense-summary', 'accounting', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
  });
}

export function useUpdatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: PurchaseInput & { id: string }) => (await api.patch<ApiSuccess<PurchaseResult>>(`/production/purchases/${id}`, input)).data.data,
    onSuccess: () => {
      ['production', 'raw-materials', 'expenses', 'expense-summary', 'accounting', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
  });
}

export function useDeletePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete<ApiSuccess<{ deleted: boolean }>>(`/production/purchases/${id}`)).data.data,
    onSuccess: () => {
      ['production', 'raw-materials', 'expenses', 'expense-summary', 'accounting', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
  });
}
