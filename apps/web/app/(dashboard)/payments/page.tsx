'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Wallet, TrendingUp, AlertTriangle, ArrowDownCircle, ArrowUpCircle, IndianRupee } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge, statusBadgeVariant } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { cn, formatINR } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { usePaymentSummary, usePayments } from '@/hooks/usePayments';
import { usePayables, usePayablesSummary, type PayableBill } from '@/hooks/usePayables';
import { PaySupplierDialog } from '@/components/payables/pay-supplier-dialog';

const AGING_COLOR: Record<string, string> = { current: 'bg-success', '0-7': 'bg-success', '1-7': 'bg-warning', '8-15': 'bg-warning', '16-30': 'bg-danger', '30+': 'bg-danger' };
const AGING_LABEL: Record<string, string> = { current: 'Not due', '0-7': '0–7 days', '1-7': '1–7 days', '8-15': '8–15 days', '16-30': '16–30 days', '30+': '30+ days' };

export default function PaymentsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const canSeePayables = role === 'SUPER_ADMIN' || role === 'GODOWN_MANAGER';
  const [tab, setTab] = useState<'in' | 'out'>(role === 'GODOWN_MANAGER' ? 'out' : 'in');

  if (!canSeePayables) return <ReceivablesView />;

  return (
    <div className="space-y-5">
      <div className="flex gap-1 border-b border-border">
        {([['in', 'Receivables (money in)'], ['out', 'Payables (money out)']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('flex items-center gap-1.5 border-b-2 px-4 py-2 text-body font-medium transition-colors', tab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {k === 'in' ? <ArrowDownCircle className="h-4 w-4" /> : <ArrowUpCircle className="h-4 w-4" />}{l}
          </button>
        ))}
      </div>
      {tab === 'in' ? <ReceivablesView /> : <PayablesView />}
    </div>
  );
}

// ─────────────────────────── Receivables (money in) ─────────────────────────
function ReceivablesView() {
  const { data: summary, isLoading } = usePaymentSummary();
  const { data: payments } = usePayments();
  const maxAging = Math.max(1, ...(summary?.aging.map((a) => a.amount) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {isLoading || !summary ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        ) : (
          <>
            <KpiCard label="Total Receivables" value={formatINR(summary.totalReceivables, { decimals: false })} icon={Wallet} accent="warning" />
            <KpiCard label="Collected This Month" value={formatINR(summary.collectedThisMonth, { decimals: false })} icon={TrendingUp} accent="success" />
            <KpiCard label="Overdue Amount" value={formatINR(summary.overdueAmount, { decimals: false })} icon={AlertTriangle} accent="danger" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Receivables Aging</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {summary?.aging.map((a) => <AgingBar key={a.label} a={a} max={maxAging} />)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Outlet Outstanding</CardTitle></CardHeader>
          <CardContent>
            {summary?.outletOutstanding.length ? (
              <Table>
                <THead><TR><TH>Outlet</TH><TH className="text-right">Outstanding</TH></TR></THead>
                <TBody>{summary.outletOutstanding.map((o) => <TR key={o.outletId}><TD className="font-medium">{o.outletName}</TD><TD className="text-right text-warning">{formatINR(o.outstanding)}</TD></TR>)}</TBody>
              </Table>
            ) : <p className="py-6 text-center text-body text-muted-foreground">No outstanding balances 🎉</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Payments Received</CardTitle></CardHeader>
        <CardContent className="p-0">
          {!payments?.length ? <p className="py-10 text-center text-body text-muted-foreground">No payments recorded yet.</p> : (
            <Table>
              <THead><TR><TH>Payment #</TH><TH>Outlet</TH><TH>Bill</TH><TH>Method</TH><TH className="text-right">Amount</TH><TH>Date</TH></TR></THead>
              <TBody>
                {payments.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-medium">{p.paymentNumber}</TD><TD>{p.outlet.name}</TD>
                    <TD className="text-muted-foreground">{p.bill?.billNumber ?? '—'}</TD>
                    <TD><Badge variant={p.channel === 'DIGITAL' ? 'info' : 'neutral'}>{p.method}</Badge></TD>
                    <TD className="text-right font-medium text-success">{formatINR(p.amount)}</TD>
                    <TD>{format(new Date(p.paymentDate), 'dd MMM yyyy')}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─────────────────────────── Payables (money out) ───────────────────────────
function PayablesView() {
  const { data: summary, isLoading } = usePayablesSummary();
  const [outstandingOnly, setOutstandingOnly] = useState(true);
  const { data: bills } = usePayables({ outstandingOnly: outstandingOnly || undefined });
  const [payTarget, setPayTarget] = useState<PayableBill | null>(null);
  const maxAging = Math.max(1, ...(summary?.aging.map((a) => a.amount) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {isLoading || !summary ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        ) : (
          <>
            <KpiCard label="Total Payable (we owe)" value={formatINR(summary.totalPayable, { decimals: false })} icon={ArrowUpCircle} accent="danger" />
            <KpiCard label="Paid to Suppliers (month)" value={formatINR(summary.paidThisMonth, { decimals: false })} icon={TrendingUp} accent="success" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Payables Aging</CardTitle></CardHeader>
          <CardContent className="space-y-3">{summary?.aging.map((a) => <AgingBar key={a.label} a={a} max={maxAging} />)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Supplier Outstanding</CardTitle></CardHeader>
          <CardContent>
            {summary?.bySupplier.length ? (
              <Table>
                <THead><TR><TH>Supplier</TH><TH className="text-right">Outstanding</TH></TR></THead>
                <TBody>{summary.bySupplier.map((s) => <TR key={s.supplierName}><TD className="font-medium">{s.supplierName}</TD><TD className="text-right text-danger">{formatINR(s.outstanding)}</TD></TR>)}</TBody>
              </Table>
            ) : <p className="py-6 text-center text-body text-muted-foreground">Nothing owed to suppliers 🎉</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Supplier Bills</CardTitle>
          <label className="flex items-center gap-2 text-caption text-muted-foreground"><input type="checkbox" className="h-4 w-4" checked={outstandingOnly} onChange={(e) => setOutstandingOnly(e.target.checked)} /> Outstanding only</label>
        </CardHeader>
        {!bills?.length ? <p className="py-10 text-center text-body text-muted-foreground">No supplier bills.</p> : (
          <Table>
            <THead><TR><TH>Bill #</TH><TH>Supplier</TH><TH>Invoice</TH><TH>Date</TH><TH className="text-right">Total</TH><TH className="text-right">Balance</TH><TH>Status</TH><TH className="text-right">Action</TH></TR></THead>
            <TBody>
              {bills.map((b) => (
                <TR key={b.id}>
                  <TD className="font-medium">{b.billNumber}</TD>
                  <TD>{b.supplierName ?? '—'}</TD>
                  <TD className="text-muted-foreground">{b.invoiceNumber ?? '—'}</TD>
                  <TD>{format(new Date(b.billDate), 'dd MMM yyyy')}</TD>
                  <TD className="text-right">{formatINR(b.totalAmount)}</TD>
                  <TD className={cn('text-right', Number(b.balanceDue) > 0 && 'font-medium text-danger')}>{formatINR(b.balanceDue)}</TD>
                  <TD><Badge variant={statusBadgeVariant(b.status)}>{b.status.replace('_', ' ')}</Badge></TD>
                  <TD className="text-right">
                    {b.status !== 'PAID'
                      ? <Button size="sm" onClick={() => setPayTarget(b)}><IndianRupee className="h-3.5 w-3.5" /> Pay</Button>
                      : <span className="text-caption text-muted-foreground">—</span>}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <PaySupplierDialog bill={payTarget} onClose={() => setPayTarget(null)} />
    </div>
  );
}

function AgingBar({ a, max }: { a: { label: string; amount: number }; max: number }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-caption">
        <span className="text-muted-foreground">{AGING_LABEL[a.label] ?? a.label}</span>
        <span className="font-medium">{formatINR(a.amount, { decimals: false })}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface">
        <div className={`h-2 rounded-full ${AGING_COLOR[a.label] ?? 'bg-primary'}`} style={{ width: `${(a.amount / max) * 100}%` }} />
      </div>
    </div>
  );
}
