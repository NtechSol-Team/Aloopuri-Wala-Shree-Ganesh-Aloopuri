'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getDevKey } from '@/store/dev.store';
import type { ApiSuccess } from '@/types/api';

export interface MetricPoint {
  at: string;
  loadAvg1: number;
  loadAvg5: number;
  loadAvg15: number;
  memUsedPct: number;
  /** Bytes since the previous sample; null where it can't be derived. */
  netRxBytes: number | null;
  netTxBytes: number | null;
}

function devHeaders() {
  return { headers: { 'x-developer-key': getDevKey() ?? '' } };
}

export function useRecentServerMetrics(hours: number, enabled: boolean) {
  return useQuery({
    queryKey: ['developer-metrics', 'recent', hours],
    enabled,
    // The underlying table only gains a row every few minutes, so this is just
    // a gentle refresh while the developer has the tab open.
    refetchInterval: 60_000,
    queryFn: async () =>
      (await api.get<ApiSuccess<MetricPoint[]>>('/developer-metrics/recent', { params: { hours }, ...devHeaders() })).data.data,
  });
}
