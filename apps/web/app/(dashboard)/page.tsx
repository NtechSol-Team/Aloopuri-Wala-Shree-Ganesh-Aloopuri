'use client';

import { format } from 'date-fns';
import { IndianRupee, TrendingUp, Wallet, AlertTriangle, Trophy } from 'lucide-react';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboard } from '@/hooks/useDashboard';
import { useAuthStore } from '@/store/auth.store';
import { formatINR } from '@/lib/utils';

export default function DashboardPage() {
  const { data, isLoading } = useDashboard();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-page-heading font-bold">Welcome back, {user?.name?.split(' ')[0]} 👋</h2>
        <p className="text-body text-muted-foreground">Here is what is happening across your business today.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading || !data ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        ) : (
          <>
            <KpiCard label="Today's Sales" value={formatINR(data.todaySales, { decimals: false })} icon={IndianRupee} accent="success" />
            <KpiCard label="Revenue (This Month)" value={formatINR(data.monthRevenue, { decimals: false })} changePct={data.revenueChangePct} icon={TrendingUp} accent="primary" />
            <KpiCard label="Outstanding" value={formatINR(data.outstandingReceivables, { decimals: false })} icon={Wallet} accent="warning" href="/payments" />
            <KpiCard label="Low Stock Alerts" value={String(data.lowStockCount)} icon={AlertTriangle} accent="danger" href="/inventory" />
          </>
        )}
      </div>

      {/* Top product */}
      {data?.topProductToday && (
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-warning/10 text-warning">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <p className="text-caption text-muted-foreground">Top selling product today</p>
              <p className="text-label font-semibold">
                {data.topProductToday.name} · {data.topProductToday.quantity} sold
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live feeds */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)
            ) : data?.recentOrders.length ? (
              data.recentOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <p className="text-body font-medium">{o.orderNumber}</p>
                    <p className="text-caption text-muted-foreground">{o.outletName} · {format(new Date(o.orderDate), 'dd MMM')}</p>
                  </div>
                  <Badge variant={statusBadgeVariant(o.status)}>{o.status}</Badge>
                </div>
              ))
            ) : (
              <EmptyState text="No orders yet." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)
            ) : data?.recentPayments.length ? (
              data.recentPayments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <p className="text-body font-medium">{formatINR(p.amount)}</p>
                    <p className="text-caption text-muted-foreground">{p.outletName} · {p.method}</p>
                  </div>
                  <span className="text-caption text-muted-foreground">{format(new Date(p.paymentDate), 'dd MMM')}</span>
                </div>
              ))
            ) : (
              <EmptyState text="No payments recorded yet." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-6 text-center text-body text-muted-foreground">{text}</p>;
}
