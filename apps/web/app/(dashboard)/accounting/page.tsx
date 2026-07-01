'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { ArrowDownRight, ArrowUpRight, Wallet, TrendingUp, Boxes, ReceiptText, ShoppingCart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR } from '@/lib/utils';
import { usePosition, useDayBook, useProfitability, type ProductProfit } from '@/hooks/useAccounting';

type Tab = 'position' | 'daybook' | 'profit';

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>('position');
  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-border">
        {([['position', 'Financial Position'], ['daybook', 'Day Book'], ['profit', 'Product Profitability']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('border-b-2 px-4 py-2 text-body font-medium transition-colors', tab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{l}</button>
        ))}
      </div>
      {tab === 'position' && <PositionTab />}
      {tab === 'daybook' && <DayBookTab />}
      {tab === 'profit' && <ProfitTab />}
    </div>
  );
}

function PositionTab() {
  const { data: p, isLoading } = usePosition();
  if (isLoading || !p) return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>;

  return (
    <div className="space-y-5">
      <p className="text-caption text-muted-foreground">Flows are month-to-date; balances are current.</p>

      {/* Cash flow */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Money In (month)" value={formatINR(p.moneyIn, { decimals: false })} icon={ArrowUpRight} accent="success" sub={`Cash ${formatINR(p.moneyInCash, { decimals: false })} · Digital ${formatINR(p.moneyInDigital, { decimals: false })}`} />
        <Stat label="Money Out (month)" value={formatINR(p.moneyOut, { decimals: false })} icon={ArrowDownRight} accent="danger" sub={`Expenses ${formatINR(p.expensesMonth, { decimals: false })} · Purchases ${formatINR(p.purchasesMonth, { decimals: false })}`} />
        <Stat label="Net Cash Flow" value={formatINR(p.netCashFlow, { decimals: false })} icon={Wallet} accent={p.netCashFlow >= 0 ? 'success' : 'danger'} />
        <Stat label="Receivables (AR)" value={formatINR(p.receivables, { decimals: false })} icon={ReceiptText} accent="warning" sub="owed by outlets" />
      </div>

      {/* P&L + stock */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Profit & Loss (month)</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-body">
            <Line label="Revenue (POS + billing)" value={p.revenueMonth} />
            <Line label="– Cost of goods (BOM)" value={-p.cogsMonth} muted />
            <Line label="Gross profit" value={p.grossProfit} bold />
            <Line label="– Operating expenses" value={-p.expensesMonth} muted />
            <div className="my-1 border-t border-border" />
            <Line label="Net profit" value={p.netProfit} bold accent={p.netProfit >= 0 ? 'success' : 'danger'} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Assets snapshot</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-body">
            <Line label="Raw material stock (at cost)" value={p.rawStockValue} />
            <Line label="Finished goods (at sale value)" value={p.finishedGoodsValue} />
            <Line label="Inventory total" value={p.stockValue} bold />
            <div className="my-1 border-t border-border" />
            <Line label="Receivables (owed to us)" value={p.receivables} accent="success" />
            <Line label="Payables (we owe suppliers)" value={-p.payables} accent="danger" />
            <Line label="Net (receivables − payables)" value={p.receivables - p.payables} bold />
            <p className="pt-1 text-caption text-muted-foreground">Tip: collect receivables faster than you pay payables to keep cash positive.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, accent, sub }: { label: string; value: string; icon: typeof Wallet; accent: 'success' | 'danger' | 'warning' | 'primary'; sub?: string }) {
  const bg = { success: 'bg-success/10 text-success', danger: 'bg-danger/10 text-danger', warning: 'bg-warning/10 text-warning', primary: 'bg-primary/10 text-primary' }[accent];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-caption uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-kpi font-bold leading-none">{value}</p>
          {sub && <p className="mt-1 truncate text-caption text-muted-foreground">{sub}</p>}
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', bg)}><Icon className="h-5 w-5" /></div>
      </div>
    </Card>
  );
}

function Line({ label, value, bold, muted, accent }: { label: string; value: number; bold?: boolean; muted?: boolean; accent?: 'success' | 'danger' }) {
  return (
    <div className={cn('flex justify-between', bold && 'font-semibold', muted && 'text-muted-foreground', accent === 'success' && 'text-success', accent === 'danger' && 'text-danger')}>
      <span>{label}</span><span>{formatINR(value)}</span>
    </div>
  );
}

const TYPE_META: Record<string, { label: string; icon: typeof Wallet; variant: 'success' | 'danger' | 'info' | 'neutral' }> = {
  PAYMENT_IN: { label: 'Payment', icon: ReceiptText, variant: 'success' },
  POS_SALE: { label: 'POS Sale', icon: Wallet, variant: 'success' },
  EXPENSE: { label: 'Expense', icon: TrendingUp, variant: 'danger' },
  PURCHASE: { label: 'Purchase', icon: ShoppingCart, variant: 'danger' },
};

function DayBookTab() {
  const { data, isLoading } = useDayBook();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <MiniStat label="Total In" value={formatINR(data?.totalIn ?? 0, { decimals: false })} accent="success" loading={isLoading} />
        <MiniStat label="Total Out" value={formatINR(data?.totalOut ?? 0, { decimals: false })} accent="danger" loading={isLoading} />
        <MiniStat label="Net" value={formatINR(data?.net ?? 0, { decimals: false })} accent={(data?.net ?? 0) >= 0 ? 'success' : 'danger'} loading={isLoading} />
      </div>
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Day Book — last 30 days</CardTitle></CardHeader>
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !data?.entries.length ? (
          <p className="py-12 text-center text-muted-foreground">No transactions in this period.</p>
        ) : (
          <Table>
            <THead><TR><TH>Date</TH><TH>Type</TH><TH>Party</TH><TH>Reference</TH><TH>Method</TH><TH className="text-right">In</TH><TH className="text-right">Out</TH></TR></THead>
            <TBody>
              {data.entries.map((e, i) => {
                const m = TYPE_META[e.type];
                return (
                  <TR key={i}>
                    <TD className="whitespace-nowrap text-muted-foreground">{format(new Date(e.date), 'dd MMM')}</TD>
                    <TD><Badge variant={m.variant}>{m.label}</Badge></TD>
                    <TD className="font-medium">{e.party ?? '—'}</TD>
                    <TD className="text-muted-foreground">{e.reference ?? '—'}</TD>
                    <TD className="text-muted-foreground">{e.method?.replace('_', ' ') ?? '—'}</TD>
                    <TD className="text-right text-success">{e.inflow ? formatINR(e.inflow) : ''}</TD>
                    <TD className="text-right text-danger">{e.outflow ? formatINR(e.outflow) : ''}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function MiniStat({ label, value, accent, loading }: { label: string; value: string; accent: 'success' | 'danger'; loading?: boolean }) {
  if (loading) return <Skeleton className="h-20" />;
  return (
    <Card className="p-4">
      <p className="text-caption uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-card-title font-bold', accent === 'success' ? 'text-success' : 'text-danger')}>{value}</p>
    </Card>
  );
}

function ProfitTab() {
  const { data, isLoading } = useProfitability();
  if (isLoading) return <Card className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</Card>;
  if (!data?.length) return <Card><p className="py-12 text-center text-muted-foreground">No sales in the last 90 days yet.</p></Card>;

  const best = data[0];
  const worst = [...data].reverse().find((d) => d.margin_pct < 100) ?? data[data.length - 1];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Highlight label="Best margin" product={best} good />
        <Highlight label="Lowest margin" product={worst} />
      </div>
      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Product Profitability — last 90 days</CardTitle></CardHeader>
        <Table>
          <THead><TR><TH>Product</TH><TH className="text-right">Qty Sold</TH><TH className="text-right">Revenue</TH><TH className="text-right">Material Cost</TH><TH className="text-right">Margin</TH><TH className="text-right">Margin %</TH></TR></THead>
          <TBody>
            {data.map((d) => (
              <TR key={d.name}>
                <TD className="font-medium">{d.name}</TD>
                <TD className="text-right">{d.qty}</TD>
                <TD className="text-right">{formatINR(d.revenue)}</TD>
                <TD className="text-right text-muted-foreground">{formatINR(d.cogs)}</TD>
                <TD className={cn('text-right font-medium', d.margin >= 0 ? 'text-success' : 'text-danger')}>{formatINR(d.margin)}</TD>
                <TD className="text-right">
                  <Badge variant={d.margin_pct >= 40 ? 'success' : d.margin_pct >= 20 ? 'warning' : 'danger'}>{d.margin_pct}%</Badge>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="p-4 text-caption text-muted-foreground">Material cost uses the product BOM at current weighted-average raw-material cost. Products with no BOM show 100% margin — add their BOM for accurate costing.</p>
      </Card>
    </div>
  );
}

function Highlight({ label, product, good }: { label: string; product: ProductProfit; good?: boolean }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className={cn('flex h-11 w-11 items-center justify-center rounded-md', good ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning')}>
          {good ? <TrendingUp className="h-5 w-5" /> : <Boxes className="h-5 w-5" />}
        </div>
        <div>
          <p className="text-caption uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-card-title font-bold leading-tight">{product.name}</p>
          <p className="text-caption text-muted-foreground">{product.margin_pct}% margin · {formatINR(product.margin)} on {product.qty} sold</p>
        </div>
      </div>
    </Card>
  );
}
