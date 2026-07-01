'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export interface FinancialPosition {
  moneyIn: number; moneyInCash: number; moneyInDigital: number;
  moneyOut: number; netCashFlow: number;
  revenueMonth: number; posSalesMonth: number; billingMonth: number;
  expensesMonth: number; purchasesMonth: number; cogsMonth: number;
  grossProfit: number; netProfit: number;
  receivables: number; payables: number; rawStockValue: number; finishedGoodsValue: number; stockValue: number;
}

export interface DayBookEntry {
  type: 'PAYMENT_IN' | 'POS_SALE' | 'EXPENSE' | 'PURCHASE';
  date: string; party: string | null; method: string | null; reference: string | null;
  inflow: number; outflow: number;
}
export interface DayBook { entries: DayBookEntry[]; totalIn: number; totalOut: number; net: number }

export interface ProductProfit {
  name: string; qty: number; revenue: number; unit_cost: number; cogs: number; margin: number; margin_pct: number;
}

export function usePosition() {
  return useQuery({ queryKey: ['accounting', 'position'], queryFn: async () => (await api.get<ApiSuccess<FinancialPosition>>('/accounting/position')).data.data });
}
export function useDayBook(params: { from?: string; to?: string } = {}) {
  return useQuery({ queryKey: ['accounting', 'daybook', params], queryFn: async () => (await api.get<ApiSuccess<DayBook>>('/accounting/daybook', { params })).data.data });
}
export function useProfitability() {
  return useQuery({ queryKey: ['accounting', 'profitability'], queryFn: async () => (await api.get<ApiSuccess<ProductProfit[]>>('/accounting/profitability')).data.data });
}
