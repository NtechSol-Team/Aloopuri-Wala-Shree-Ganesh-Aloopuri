'use client';

import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export interface GstLookupResult {
  gstin: string;
  valid: boolean;
  stateCode: string | null;
  stateName: string | null;
  legalName: string | null;
  tradeName: string | null;
  address: string | null;
  status: string | null;
  source: 'gstzen' | 'validation';
}

/** Resolve a GSTIN (validate + GSTzen enrich). Used by customer + purchase forms. */
export function useGstLookup() {
  return useMutation({
    mutationFn: async (gstin: string) =>
      (await api.get<ApiSuccess<GstLookupResult>>('/customers/lookup', { params: { gstin } })).data.data,
  });
}
