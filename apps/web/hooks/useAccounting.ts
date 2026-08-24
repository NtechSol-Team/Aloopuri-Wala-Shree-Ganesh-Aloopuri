'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export type CashBookEntryType = 'RECEIPT' | 'POS_SALE' | 'EXPENSE' | 'SUPPLIER_PAYMENT' | 'ADJUSTMENT';
export interface CashBookEntry {
  type: CashBookEntryType; date: string; description: string; reference: string | null;
  in: number; out: number; balance: number; sourceId: string | null;
}
export interface CashBook { openingBalance: number; closingBalance: number; totalIn: number; totalOut: number; entries: CashBookEntry[] }

export function useCashBook(params: { from?: string; to?: string } = {}) {
  return useQuery({ queryKey: ['accounting', 'cashbook', params], queryFn: async () => (await api.get<ApiSuccess<CashBook>>('/accounting/cashbook', { params })).data.data });
}

/** Opening balance when the Cash Book starts being used, or a later correction
 *  after a physical count — same endpoint either way, see accounting.service.ts. */
export function useAddCashAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { amount: number; adjustmentDate: string; reason: string }) =>
      (await api.post('/accounting/cashbook/adjustments', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'cashbook'] }),
  });
}

export function useDeleteCashAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/accounting/cashbook/adjustments/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'cashbook'] }),
  });
}

export type LedgerAccountKind = 'PERSON' | 'OUTLET' | 'SUPPLIER';

export interface LedgerAccount { id: string; name: string; kind: LedgerAccountKind; balance: number }

export interface LedgerEntry {
  date: string; type: string; description: string; reference: string | null;
  debit: number; credit: number; balance: number; sourceId: string | null;
}

export interface Ledger {
  accountId: string;
  kind: LedgerAccountKind;
  openingBalance: number;
  closingBalance: number;
  totalDebit: number;
  totalCredit: number;
  entries: LedgerEntry[];
}

export function useLedgerAccounts() {
  return useQuery({
    queryKey: ['accounting', 'ledger', 'accounts'],
    queryFn: async () => (await api.get<ApiSuccess<{ accounts: LedgerAccount[] }>>('/accounting/ledger/accounts')).data.data.accounts,
  });
}

export function useLedger(params: { accountId?: string; from?: string; to?: string; search?: string }) {
  return useQuery({
    queryKey: ['accounting', 'ledger', params],
    enabled: !!params.accountId,
    queryFn: async () => (await api.get<ApiSuccess<Ledger>>('/accounting/ledger', { params })).data.data,
  });
}
