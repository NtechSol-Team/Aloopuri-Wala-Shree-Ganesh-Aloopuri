'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export type TrendPeriod = 'daily' | 'weekly' | 'monthly';

export interface TrendPoint { bucket: string; pos: number; billing: number; total: number }
export interface TopProducts {
  byRevenue: Array<{ name: string; revenue: number }>;
  byQuantity: Array<{ name: string; qty: number }>;
}
export interface MonthlyPL {
  month: string; pos_revenue: number; billing_revenue: number; total_revenue: number;
  cogs: number; expenses: number; gross_profit: number; net_profit: number;
}
export interface OutletPerf {
  outlet_id: string; outlet_name: string; total_orders: number;
  total_billed: number; total_paid: number; outstanding: number; last_order_date: string | null;
}
export interface InventoryAnalytics {
  lowStock: Array<{ name: string; location: string; quantity: number; reorder: number }>;
  slowMoving: string[];
}

export interface PosAnalytics {
  summary: {
    todayRevenue: number; todayTransactions: number; monthRevenue: number; monthTransactions: number;
    avgBillValue: number; monthVoids: number; monthVoidedAmount: number;
  };
  daily: Array<{ date: string; revenue: number; transactions: number; itemsSold: number; voided: number; voidedAmount: number }>;
  byPaymentMode: Array<{ mode: string; revenue: number; transactions: number }>;
  byHour: Array<{ hour: number; revenue: number; transactions: number }>;
  topByQty: Array<{ name: string; revenue: number; qty: number }>;
  topByRevenue: Array<{ name: string; revenue: number; qty: number }>;
  // Full item-wise report, last 30 days — every item sold, not just the top 10.
  itemsReport: Array<{ name: string; category: string; qty: number; revenue: number; avgPrice: number; revenueSharePct: number }>;
  byCashier: Array<{ cashier: string; revenue: number; transactions: number }>;
}

export function useRevenueTrend(period: TrendPeriod) {
  return useQuery({ queryKey: ['analytics', 'trend', period], queryFn: async () => (await api.get<ApiSuccess<TrendPoint[]>>('/analytics/sales/trend', { params: { period } })).data.data });
}
export function useTopProducts() {
  return useQuery({ queryKey: ['analytics', 'top'], queryFn: async () => (await api.get<ApiSuccess<TopProducts>>('/analytics/sales/top-products')).data.data });
}
export function useFinancial() {
  return useQuery({ queryKey: ['analytics', 'financial'], queryFn: async () => (await api.get<ApiSuccess<{ monthly: MonthlyPL[]; current: MonthlyPL | null }>>('/analytics/financial')).data.data });
}
export function useOutletPerformance() {
  return useQuery({ queryKey: ['analytics', 'outlets'], queryFn: async () => (await api.get<ApiSuccess<OutletPerf[]>>('/analytics/outlets')).data.data });
}
export function useInventoryAnalytics() {
  return useQuery({ queryKey: ['analytics', 'inventory'], queryFn: async () => (await api.get<ApiSuccess<InventoryAnalytics>>('/analytics/inventory')).data.data });
}
export function usePosAnalytics() {
  return useQuery({ queryKey: ['analytics', 'pos'], queryFn: async () => (await api.get<ApiSuccess<PosAnalytics>>('/analytics/pos')).data.data });
}

export interface OutletDetail {
  outlet: { id: string; name: string; code: string; creditPeriodDays: number };
  summary: {
    lifetimeOrders: number; totalBilled: number; totalPaid: number; outstanding: number;
    avgOrderValue: number; lastOrderDate: string | null; avgDaysToPay: number | null;
    thisMonth: { orders: number; billed: number };
    lastMonth: { orders: number; billed: number };
    sameMonthLastYear: { orders: number; billed: number };
    momRevenuePct: number; yoyRevenuePct: number; momOrdersPct: number;
  };
  monthly: Array<{ month: string; orders: number; billed: number; paid: number }>;
  topProducts: Array<{ name: string; qty: number; value: number }>;
}

export function useOutletDetail(outletId: string | null) {
  return useQuery({
    queryKey: ['analytics', 'outlet', outletId],
    enabled: !!outletId,
    queryFn: async () => (await api.get<ApiSuccess<OutletDetail>>(`/analytics/outlets/${outletId}`)).data.data,
  });
}
