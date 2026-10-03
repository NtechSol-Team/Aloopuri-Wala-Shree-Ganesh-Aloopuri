'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export type OutletExpensePaymentMethod = 'CASH' | 'ONLINE' | 'CHEQUE' | 'BANK';
export type OutletExpenseLocation = 'SHOP' | 'GODOWN';

export const OUTLET_EXPENSE_METHOD_LABEL: Record<OutletExpensePaymentMethod, string> = {
  CASH: 'Cash', ONLINE: 'Online', CHEQUE: 'Cheque', BANK: 'Bank',
};
export const OUTLET_EXPENSE_LOCATION_LABEL: Record<OutletExpenseLocation, string> = {
  SHOP: 'Shop', GODOWN: 'Godown',
};

export interface OutletExpenseRow {
  id: string;
  expenseDate: string;
  description: string;
  amount: number;
  paymentMethod: OutletExpensePaymentMethod;
  location: OutletExpenseLocation;
}

export interface OutletExpensesResponse {
  outlet: { id: string; name: string };
  rows: OutletExpenseRow[];
  filteredTotal: number;
  byLocation: Record<OutletExpenseLocation, number>;
  byPaymentMethod: Record<OutletExpensePaymentMethod, number>;
  summary: { openingBalance: number; posSales: number; totalExpenses: number; netProfit: number; closingBalance: number };
  opening: { amount: number; asOfDate: string; notes: string | null } | null;
}

export interface OutletExpenseFilters {
  outletId: string;
  from?: string;
  to?: string;
  location?: OutletExpenseLocation;
  paymentMethod?: OutletExpensePaymentMethod;
}

export function useOutletExpenses(params: OutletExpenseFilters) {
  return useQuery({
    queryKey: ['outlet-expenses', params],
    queryFn: async () => (await api.get<ApiSuccess<OutletExpensesResponse>>('/outlet-expenses', { params })).data.data,
  });
}

export interface OutletExpenseInput {
  expenseDate: string;
  description: string;
  amount: number;
  paymentMethod: OutletExpensePaymentMethod;
  location: OutletExpenseLocation;
}

export function useSaveOutletExpense(outletId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: OutletExpenseInput & { id?: string }) =>
      id
        ? (await api.patch(`/outlet-expenses/${id}`, input)).data
        : (await api.post('/outlet-expenses', { outletId, ...input })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlet-expenses'] }),
  });
}

export function useDeleteOutletExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/outlet-expenses/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlet-expenses'] }),
  });
}

export function useSetOutletOpeningBalance(outletId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { amount: number; asOfDate: string; notes?: string }) =>
      (await api.put('/outlet-expenses/opening-balance', { outletId, ...input })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlet-expenses'] }),
  });
}
