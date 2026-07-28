'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getDevKey } from '@/store/dev.store';
import type { ApiSuccess } from '@/types/api';

export type ExpenseCategory = 'DROPLET' | 'DATABASE' | 'AI' | 'DOMAIN' | 'OTHER';

export interface DeveloperExpense {
  id: string;
  category: ExpenseCategory;
  label: string | null;
  amount: number;
  isRecurring: boolean;
  incurredOn: string;
  endedOn: string | null;
  notes: string | null;
  isEnded: boolean;
}

export interface ExpenseTotals {
  thisYear: number;
  allTime: number;
  /** Active recurring cost per month, and the same figure annualised. */
  monthlyRunRate: number;
  annualRunRate: number;
}

export interface SaveExpenseInput {
  id?: string;
  category: ExpenseCategory;
  label?: string;
  amount: number;
  isRecurring: boolean;
  incurredOn: string;
  endedOn?: string | null;
  notes?: string;
}

function devHeaders() {
  return { headers: { 'x-developer-key': getDevKey() ?? '' } };
}

export function useDeveloperExpenses(enabled: boolean) {
  return useQuery({
    queryKey: ['developer-expenses'],
    enabled,
    queryFn: async () =>
      (await api.get<ApiSuccess<{ expenses: DeveloperExpense[]; totals: ExpenseTotals }>>('/developer-expenses', devHeaders())).data.data,
  });
}

export function useSaveDeveloperExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: SaveExpenseInput) =>
      id
        ? (await api.patch<ApiSuccess<unknown>>(`/developer-expenses/${id}`, input, devHeaders())).data.data
        : (await api.post<ApiSuccess<unknown>>('/developer-expenses', input, devHeaders())).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['developer-expenses'] }),
  });
}

export function useDeleteDeveloperExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/developer-expenses/${id}`, devHeaders())).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['developer-expenses'] }),
  });
}
