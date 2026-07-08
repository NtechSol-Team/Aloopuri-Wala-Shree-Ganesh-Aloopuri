'use client';

import { useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { AlertTriangle, ChevronRight, Receipt, Ban, ReceiptText, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { cn, formatINR } from '@/lib/utils';
import { useRevenueTrend, useTopProducts, useFinancial, useOutletPerformance, useInventoryAnalytics, usePosAnalytics, type TrendPeriod } from '@/hooks/useAnalytics';
import { TrendingUp, Wallet, BadgeIndianRupee } from 'lucide-react';
import { OutletDetailDialog } from '@/components/analytics/outlet-detail-dialog';

type Tab = 'sales' | 'pos' | 'outlets' | 'inventory' | 'financial';

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('sales');
  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-border">
        {([['sales', 'Sales'], ['pos', 'POS'], ['outlets', 'Outlets'], ['inventory', 'Inventory'], ['financial', 'Financial P&L']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('border-b-2 px-4 py-2 text-body font-medium', tab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{l}</button>
        ))}
      </div>
      {tab === 'sales' && <SalesTab />}
      {tab === 'pos' && <PosTab />}
      {tab === 'outlets' && <OutletsTab />}
      {tab === 'inventory' && <InventoryTab />}
      {tab === 'financial' && <FinancialTab />}
    </div>
  );
}

function SalesTab() {
  const [period, setPeriod] = useState<TrendPeriod>('monthly');
  const { data: trend, isLoading } = useRevenueTrend(period);
  const { data: top } = useTopProducts();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Revenue Trend</CardTitle>
          <div className="flex flex-wrap gap-1">
            {(['daily', 'weekly', 'monthly'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)} className={cn('rounded-md px-3 py-1 text-caption font-medium capitalize', period === p ? 'bg-primary text-primary-foreground' : 'bg-surface')}>{p}</button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading || !trend ? <Skeleton className="h-72" /> : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#6B7280' }} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} />
                <Tooltip formatter={(v: number) => formatINR(v)} />
                <Legend />
                <Line type="monotone" dataKey="pos" name="POS" stroke="#16A34A" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="billing" name="Billing" stroke="#D97706" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="total" name="Total" stroke="#3730A3" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopChart title="Top 10 by Revenue" data={(top?.byRevenue ?? []).map((d) => ({ name: d.name, value: d.revenue }))} money />
        <TopChart title="Top 10 by Quantity" data={(top?.byQuantity ?? []).map((d) => ({ name: d.name, value: d.qty }))} />
      </div>
    </div>
  );
}

function TopChart({ title, data, money }: { title: string; data: Array<{ name: string; value: number }>; money?: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        {!data.length ? <p className="py-8 text-center text-muted-foreground">No data</p> : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data} layout="vertical" margin={{ left: 30 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(v) => (money ? `₹${v}` : `${v}`)} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11, fill: '#6B7280' }} />
              <Tooltip formatter={(v: number) => (money ? formatINR(v) : v)} />
              <Bar dataKey="value" fill="#3730A3" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

function PosTab() {
  const { data, isLoading } = usePosAnalytics();
  if (isLoading || !data) return <Skeleton className="h-72" />;
  const { summary } = data;
  const peakHour = data.byHour.reduce((best, h) => (h.revenue > best.revenue ? h : best), data.byHour[0]);
  const fmtHour = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'am' : 'pm'}`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Today's POS Sales" value={formatINR(summary.todayRevenue, { decimals: false })} icon={Receipt} accent="primary" />
        <KpiCard label="This Month" value={formatINR(summary.monthRevenue, { decimals: false })} icon={TrendingUp} accent="success" />
        <KpiCard label="Transactions (mo)" value={String(summary.monthTransactions)} icon={ReceiptText} accent="primary" />
        <KpiCard label="Avg Bill Value" value={formatINR(summary.avgBillValue, { decimals: false })} icon={BadgeIndianRupee} accent="warning" />
        <KpiCard label="Voided (mo)" value={`${summary.monthVoids} · ${formatINR(summary.monthVoidedAmount, { decimals: false })}`} icon={Ban} accent="danger" />
      </div>

      <Card>
        <CardHeader><CardTitle>Daily POS Sales — last 30 days</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.daily} margin={{ top: 8, right: 12, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis yAxisId="revenue" tick={{ fontSize: 11, fill: '#6B7280' }} />
              <YAxis yAxisId="txns" orientation="right" tick={{ fontSize: 11, fill: '#6B7280' }} />
              <Tooltip
                formatter={(v: number, name: string) => (name === 'Revenue' ? formatINR(v) : v)}
                labelFormatter={(d: string) => d}
              />
              <Legend />
              <Bar yAxisId="revenue" dataKey="revenue" name="Revenue" fill="#3730A3" radius={[4, 4, 0, 0]} />
              <Line yAxisId="txns" type="monotone" dataKey="transactions" name="Transactions" stroke="#16A34A" strokeWidth={2} dot={false} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TopChart title="Top 10 POS Items by Revenue" data={data.topByRevenue.map((d) => ({ name: d.name, value: d.revenue }))} money />
        <TopChart title="Top 10 POS Items by Quantity Sold" data={data.topByQty.map((d) => ({ name: d.name, value: d.qty }))} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Payment Mode Mix (this month)</CardTitle></CardHeader>
          <CardContent>
            {!data.byPaymentMode.length ? <p className="py-8 text-center text-muted-foreground">No data</p> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.byPaymentMode} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#6B7280' }} tickFormatter={(v) => `₹${v}`} />
                  <YAxis type="category" dataKey="mode" width={80} tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <Tooltip formatter={(v: number) => formatINR(v)} />
                  <Bar dataKey="revenue" fill="#D97706" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Sales by Hour of Day (last 30 days)</CardTitle>
            {peakHour?.revenue > 0 && <span className="flex items-center gap-1 text-caption text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Peak: {fmtHour(peakHour.hour)}</span>}
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.byHour} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#6B7280' }} tickFormatter={fmtHour} interval={2} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} />
                <Tooltip formatter={(v: number) => formatINR(v)} labelFormatter={(h: number) => fmtHour(h)} />
                <Bar dataKey="revenue" fill="#3730A3" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {data.byCashier.length > 0 && (
        <Card className="overflow-hidden">
          <CardHeader><CardTitle>Cashier Leaderboard (this month)</CardTitle></CardHeader>
          <Table>
            <THead><TR><TH>Cashier</TH><TH className="text-right">Transactions</TH><TH className="text-right">Revenue</TH><TH className="text-right">Avg Bill</TH></TR></THead>
            <TBody>
              {data.byCashier.map((c) => (
                <TR key={c.cashier}>
                  <TD className="font-medium">{c.cashier}</TD>
                  <TD className="text-right">{c.transactions}</TD>
                  <TD className="text-right font-semibold">{formatINR(c.revenue)}</TD>
                  <TD className="text-right text-muted-foreground">{formatINR(c.transactions > 0 ? c.revenue / c.transactions : 0)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function OutletsTab() {
  const { data, isLoading } = useOutletPerformance();
  const [selected, setSelected] = useState<string | null>(null);
  if (isLoading) return <Skeleton className="h-72" />;
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <CardTitle>Outlet Performance</CardTitle>
        <p className="text-caption text-muted-foreground">Click an outlet for a month-by-month deep dive.</p>
      </CardHeader>
      <Table>
        <THead><TR><TH>Outlet</TH><TH className="text-right">Orders</TH><TH className="text-right">Billed</TH><TH className="text-right">Paid</TH><TH className="text-right">Outstanding</TH><TH /></TR></THead>
        <TBody>
          {data?.map((o) => (
            <TR key={o.outlet_id} className="cursor-pointer" onClick={() => setSelected(o.outlet_id)}>
              <TD className="font-medium text-primary">{o.outlet_name}</TD>
              <TD className="text-right">{o.total_orders}</TD>
              <TD className="text-right">{formatINR(o.total_billed)}</TD>
              <TD className="text-right text-success">{formatINR(o.total_paid)}</TD>
              <TD className="text-right text-warning">{formatINR(o.outstanding)}</TD>
              <TD className="text-right"><ChevronRight className="h-4 w-4 text-muted-foreground" /></TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <OutletDetailDialog outletId={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}

function InventoryTab() {
  const { data, isLoading } = useInventoryAnalytics();
  if (isLoading || !data) return <Skeleton className="h-72" />;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Low Stock Alerts</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {!data.lowStock.length ? <p className="text-muted-foreground">All stock levels healthy 🎉</p> : data.lowStock.map((s, i) => (
            <div key={i} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <span className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-danger" />{s.name}</span>
              <span className="text-caption text-muted-foreground">{s.location} · {s.quantity} / {s.reorder}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Slow-moving (no sales 30d)</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {!data.slowMoving.length ? <p className="text-muted-foreground">None — everything is selling.</p> : data.slowMoving.map((n) => <Badge key={n} variant="neutral">{n}</Badge>)}
        </CardContent>
      </Card>
    </div>
  );
}

function FinancialTab() {
  const { data, isLoading } = useFinancial();
  if (isLoading || !data) return <Skeleton className="h-72" />;
  const c = data.current;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <KpiCard label="Revenue (mo)" value={formatINR(c?.total_revenue ?? 0, { decimals: false })} icon={TrendingUp} accent="primary" />
        <KpiCard label="COGS (mo)" value={formatINR(c?.cogs ?? 0, { decimals: false })} icon={BadgeIndianRupee} accent="warning" />
        <KpiCard label="Gross Profit" value={formatINR(c?.gross_profit ?? 0, { decimals: false })} icon={Wallet} accent="success" />
        <KpiCard label="Net Profit" value={formatINR(c?.net_profit ?? 0, { decimals: false })} icon={Wallet} accent={(c?.net_profit ?? 0) >= 0 ? 'success' : 'danger'} />
      </div>
      <Card>
        <CardHeader><CardTitle>Monthly P&L</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.monthly} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6B7280' }} />
              <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} />
              <Tooltip formatter={(v: number) => formatINR(v)} />
              <Legend />
              <Bar dataKey="total_revenue" name="Revenue" fill="#3730A3" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#D97706" radius={[4, 4, 0, 0]} />
              <Bar dataKey="net_profit" name="Net Profit" fill="#16A34A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
