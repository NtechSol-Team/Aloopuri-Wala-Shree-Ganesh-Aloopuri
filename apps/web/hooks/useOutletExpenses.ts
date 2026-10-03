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

export interface OutletWithdrawalRow {
  id: string;
  withdrawDate: string;
  amount: number;
  paymentMethod: OutletExpensePaymentMethod;
  notes: string | null;
}

export interface OutletMonthStatement {
  outlet: { id: string; name: string };
  period: { year: number; month: number };
  summary: {
    shopRevenue: number;
    shopExpenses: number;
    godownExpenses: number;
    totalExpenses: number;
    netProfit: number;
    withdrawn: number;
    pending: number;
  };
  rows: OutletExpenseRow[];
  filteredTotal: number;
  byLocation: Record<OutletExpenseLocation, number>;
  byPaymentMethod: Record<OutletExpensePaymentMethod, number>;
  withdrawals: OutletWithdrawalRow[];
}

export interface OutletStatementParams {
  outletId: string;
  year: number;
  month: number;
  location?: OutletExpenseLocation;
  paymentMethod?: OutletExpensePaymentMethod;
}

export function useOutletMonthStatement(params: OutletStatementParams) {
  return useQuery({
    queryKey: ['outlet-expenses', params],
    queryFn: async () => (await api.get<ApiSuccess<OutletMonthStatement>>('/outlet-expenses', { params })).data.data,
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

export function useCreateOutletWithdrawal(outletId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { year: number; month: number; withdrawDate: string; amount: number; paymentMethod: OutletExpensePaymentMethod; notes?: string }) =>
      (await api.post('/outlet-expenses/withdrawals', { outletId, ...input })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlet-expenses'] }),
  });
}

export function useDeleteOutletWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/outlet-expenses/withdrawals/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['outlet-expenses'] }),
  });
}
