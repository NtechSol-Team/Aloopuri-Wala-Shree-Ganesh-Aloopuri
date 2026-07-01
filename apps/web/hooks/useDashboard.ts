'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export interface DashboardKpis {
  todaySales: number;
  monthRevenue: number;
  lastMonthRevenue: number;
  revenueChangePct: number;
  outstandingReceivables: number;
  lowStockCount: number;
  topProductToday: { name: string; quantity: number } | null;
  recentOrders: Array<{ id: string; orderNumber: string; outletName: string; status: string; orderDate: string }>;
  recentPayments: Array<{ id: string; paymentNumber: string; outletName: string; amount: number; method: string; paymentDate: string }>;
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get<ApiSuccess<DashboardKpis>>('/analytics/dashboard');
      return data.data;
    },
  });
}
