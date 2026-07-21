'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getDevKey } from '@/store/dev.store';
import { useAuthStore } from '@/store/auth.store';
import { DEFAULT_STORE, type StoreProfile } from '@/lib/print';
import type { ApiSuccess } from '@/types/api';

export type PricingMode = 'GENERIC' | 'SPECIAL';

export interface Outlet {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  creditPeriodDays: number;
  pricingMode: PricingMode;
  /** Whether this outlet's orders/bills carry GST — fixed when the outlet is created. */
  gstBilling: boolean;
  ownerUserId: string | null;
  isActive: boolean;
  // The outlet's own business identity — printed on its counter receipts.
  legalName: string | null;
  gstin: string | null;
  fssaiNumber: string | null;
  email: string | null;
  receiptFooter: string | null;
  // The POS menu this outlet sells from (assigned by the main owner).
  assignedMenuId: string | null;
  assignedMenu: { id: string; name: string } | null;
}

/** Business details the main owner maintains (creating outlets stays developer-only). */
export interface OutletProfileInput {
  name?: string;
  legalName?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  fssaiNumber?: string | null;
  receiptFooter?: string | null;
}

export const DOCUMENT_CATEGORIES = [
  'GST_CERTIFICATE', 'FSSAI_LICENSE', 'PAN_CARD', 'AGREEMENT', 'RENT_DEED', 'OTHER',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  GST_CERTIFICATE: 'GST Certificate',
  FSSAI_LICENSE: 'FSSAI Licence',
  PAN_CARD: 'PAN Card',
  AGREEMENT: 'Agreement',
  RENT_DEED: 'Rent Deed',
  OTHER: 'Other',
};

export interface OutletDocument {
  id: string;
  outletId: string;
  title: string;
  category: DocumentCategory;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  notes: string | null;
  createdAt: string;
}

export interface OutletPriceRow {
  id: string;
  name: string;
  sku: string;
  unit: string;
  basePrice: string;
  specialPrice: string | null;
  category: { name: string };
}

/** Outlet writes are gated by the developer passphrase — sent as a header the API verifies. */
function devHeaders() {
  const key = getDevKey();
  return { headers: { 'x-developer-key': key ?? '' } };
}

export function useOutlets() {
  return useQuery({
    queryKey: ['outlets'],
    queryFn: async () => (await api.get<ApiSuccess<Outlet[]>>('/outlets')).data.data,
  });
}

/** Confirm a developer passphrase against the API; used to unlock the developer window. */
export function useVerifyDeveloperKey() {
  return useMutation({
    mutationFn: async (key: string) =>
      (await api.post<ApiSuccess<{ unlocked: boolean }>>('/outlets/dev/verify', {}, { headers: { 'x-developer-key': key } })).data.data,
  });
}

export function useSaveOutlet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<Outlet> & { id?: string; name: string; code: string }) =>
      id
        ? (await api.patch<ApiSuccess<Outlet>>(`/outlets/${id}`, input, devHeaders())).data.data
        : (await api.post<ApiSuccess<Outlet>>('/outlets', input, devHeaders())).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlets'] }),
  });
}

export function useOutletPrices(outletId: string | null) {
  return useQuery({
    queryKey: ['outlets', outletId, 'prices'],
    enabled: !!outletId,
    queryFn: async () => (await api.get<ApiSuccess<OutletPriceRow[]>>(`/outlets/${outletId}/prices`)).data.data,
  });
}

export function useSetOutletPrices(outletId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: Array<{ productId: string; price: number }>) =>
      (await api.put<ApiSuccess<OutletPriceRow[]>>(`/outlets/${outletId}/prices`, { items }, devHeaders())).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlets', outletId, 'prices'] }),
  });
}

/**
 * The outlet the signed-in user belongs to — the shop whose name, address and
 * GSTIN belong on the receipts this till prints. Null for head-office roles, in
 * which case receipts fall back to the company's own details.
 */
export function useMyOutlet() {
  const outletId = useAuthStore((s) => s.user?.outletId);
  return useQuery({
    queryKey: ['outlets', outletId],
    enabled: !!outletId,
    // The till prints from this constantly; it changes about never.
    staleTime: 5 * 60_000,
    queryFn: async () => (await api.get<ApiSuccess<Outlet>>(`/outlets/${outletId}`)).data.data,
  });
}

/**
 * The signed-in outlet's identity, shaped for the receipt printers. Undefined for
 * head-office roles, which makes the renderers fall back to the company details.
 */
export function useStoreProfile(): StoreProfile | undefined {
  const { data } = useMyOutlet();
  return useMemo(
    () =>
      data
        ? {
            name: data.legalName || data.name,
            // Each outlet still trades under the chain's banner.
            tagline: DEFAULT_STORE.tagline,
            address: data.address,
            phone: data.phone,
            gstin: data.gstin,
            fssaiNumber: data.fssaiNumber,
            footer: data.receiptFooter,
          }
        : undefined,
    [data],
  );
}

/** Business details — editable by the main owner (no developer passphrase needed). */
/** Assign (or clear) an outlet's POS menu — main-owner control. */
export function useAssignMenu() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ outletId, assignedMenuId }: { outletId: string; assignedMenuId: string | null }) =>
      (await api.patch<ApiSuccess<Outlet>>(`/outlets/${outletId}/menu`, { assignedMenuId })).data.data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['outlets'] }); qc.invalidateQueries({ queryKey: ['menus'] }); },
  });
}

export function useSaveOutletProfile(outletId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: OutletProfileInput) =>
      (await api.patch<ApiSuccess<Outlet>>(`/outlets/${outletId}/profile`, input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlets'] }),
  });
}

export function useOutletDocuments(outletId: string | null) {
  return useQuery({
    queryKey: ['outlets', outletId, 'documents'],
    enabled: !!outletId,
    queryFn: async () => (await api.get<ApiSuccess<OutletDocument[]>>(`/outlets/${outletId}/documents`)).data.data,
  });
}

export function useUploadOutletDocument(outletId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { file: File; title: string; category: DocumentCategory; notes?: string }) => {
      const form = new FormData();
      form.append('file', input.file);
      form.append('title', input.title);
      form.append('category', input.category);
      if (input.notes) form.append('notes', input.notes);
      // Let the browser set the multipart boundary itself.
      return (await api.post<ApiSuccess<OutletDocument>>(`/outlets/${outletId}/documents`, form)).data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlets', outletId, 'documents'] }),
  });
}

export function useDeleteOutletDocument(outletId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (docId: string) => (await api.delete(`/outlets/${outletId}/documents/${docId}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlets', outletId, 'documents'] }),
  });
}

/**
 * Documents are streamed from an authenticated endpoint, so they can't be linked
 * to directly — fetch the bytes with the auth header, then hand the browser a blob.
 */
export async function openOutletDocument(outletId: string, doc: OutletDocument): Promise<void> {
  const res = await api.get(`/outlets/${outletId}/documents/${doc.id}/file`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
