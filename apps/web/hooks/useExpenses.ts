'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export type ExpenseLocation = 'GODOWN' | 'MAIN_BRANCH' | 'GENERAL';
export type ExpensePaymentMethod = 'CASH' | 'CARD' | 'UPI' | 'NET_BANKING' | 'RAZORPAY' | 'BANK_TRANSFER';

export interface ExpenseCategory { id: string; name: string; isSystem: boolean }

export interface Expense {
  id: string;
  amount: string;
  expenseDate: string;
  paymentMethod: ExpensePaymentMethod;
  paidTo: string | null;
  location: ExpenseLocation;
  note: string | null;
  category: { id: string; name: string };
}

export interface ExpenseSummary {
  total: number;
  byCategory: Array<{ category: string; total: number }>;
  byLocation: Array<{ location: string; total: number }>;
  monthly: Array<{ month: string; total: number }>;
}

export function useExpenseCategories() {
  return useQuery({ queryKey: ['expense-categories'], queryFn: async () => (await api.get<ApiSuccess<ExpenseCategory[]>>('/expenses/categories')).data.data });
}

export function useExpenses(params: { location?: ExpenseLocation; categoryId?: string } = {}) {
  return useQuery({
    queryKey: ['expenses', params],
    queryFn: async () => (await api.get<ApiSuccess<Expense[]>>('/expenses', { params: { limit: 100, ...params } })).data.data,
  });
}

export function useExpenseSummary(params: { location?: ExpenseLocation } = {}) {
  return useQuery({
    queryKey: ['expense-summary', params],
    queryFn: async () => (await api.get<ApiSuccess<ExpenseSummary>>('/expenses/summary', { params })).data.data,
  });
}

export function useSaveExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id?: string; categoryId: string; amount: number; paymentMethod: string; location: string; paidTo?: string; note?: string; expenseDate?: string }) =>
      id ? (await api.patch(`/expenses/${id}`, input)).data : (await api.post('/expenses', input)).data,
    onSuccess: () => {
      ['expenses', 'expense-summary', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/expenses/${id}`)).data,
    onSuccess: () => { ['expenses', 'expense-summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); },
  });
}
