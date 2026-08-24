'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  ArrowDownRight, ArrowUpRight, Wallet, TrendingUp, Boxes, ReceiptText, ShoppingCart,
  Download, Printer, Settings2, Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn, formatINR, ist, todayIso } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { PERIODS, periodRange, type PeriodKey } from '@/lib/period';
import {
  usePosition, useDayBook, useProfitability, type ProductProfit,
  useCashBook, useAddCashAdjustment, useDeleteCashAdjustment, type CashBookEntryType,
} from '@/hooks/useAccounting';
import { LedgerTab } from '@/components/accounting/ledger-tab';

type Tab = 'position' | 'daybook' | 'cashbook' | 'ledger' | 'profit';

export default function AccountingPage() {
  const [tab, setTab] = useState<Tab>('position');
  return (
    <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto border-b border-border scrollbar-thin print:hidden">
        {(
          [
            ['position', 'Financial Position'], ['daybook', 'Day Book'], ['cashbook', 'Cash Book'],
            ['ledger', 'Ledger'], ['profit', 'Product Profitability'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('shrink-0 border-b-2 px-4 py-2 text-body font-medium transition-colors', tab === k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>{l}</button>
        ))}
      </div>
      {tab === 'position' && <PositionTab />}
      {tab === 'daybook' && <DayBookTab />}
      {tab === 'cashbook' && <CashBookTab />}
      {tab === 'ledger' && <LedgerTab />}
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
        <Stat label="Money Out (month)" value={formatINR(p.moneyOut, { decimals: false })} icon={ArrowDownRight} accent="danger" sub={`Expenses ${formatINR(p.paidExpensesMonth, { decimals: false })} · Purchases ${formatINR(p.purchasesMonth, { decimals: false })}`} />
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

/** Escapes a CSV cell — quotes doubled, whole field quoted when it contains a delimiter. */
function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function DayBookTab() {
  // No range picked yet defaults to the last 30 days, same as before this had a
  // picker at all — see accounting.routes.ts's /daybook handler.
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [custom, setCustom] = useState({ from: todayIso(), to: todayIso() });
  const range = periodRange(period, custom);
  const { data, isLoading } = useDayBook(range);

  const exportCsv = () => {
    if (!data) return;
    const rows: string[] = [
      ['Day Book', range.from ? `${range.from} to ${range.to}` : 'Last 30 days'].map(csvCell).join(','),
      ['Date', 'Type', 'Party', 'Reference', 'Method', 'In', 'Out'].join(','),
      ...data.entries.map((e) =>
        [format(ist(e.date), 'dd-MM-yyyy'), TYPE_META[e.type].label, e.party ?? '', e.reference ?? '', e.method?.replace('_', ' ') ?? '', e.inflow || '', e.outflow || '']
          .map(csvCell).join(','),
      ),
      ['Totals', '', '', '', '', data.totalIn, data.totalOut].map(csvCell).join(','),
      ['Net', '', '', '', '', '', data.net].map(csvCell).join(','),
    ];
    // BOM so Excel opens UTF-8 correctly instead of mojibake.
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `day-book-${range.from ?? 'last-30-days'}${range.to && range.to !== range.from ? `_to_${range.to}` : ''}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-3 print:hidden">
        <div className="space-y-1.5">
          <Label>Period</Label>
          <Select className="w-40" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
            {PERIODS.map(([key, label]) => <option key={key} value={key}>{key === 'all' ? 'Last 30 Days' : label}</option>)}
          </Select>
        </div>
        {period === 'custom' && (
          <>
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </div>
          </>
        )}
        <div className="ml-auto flex gap-2">
          {/* "Save as PDF" lives in the browser's own print dialog — no server-side
              PDF report exists for this yet, and the print stylesheet already hides
              this filter bar via print:hidden, so what prints is just the book. */}
          <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print / PDF</Button>
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!data?.entries.length}><Download className="h-4 w-4" /> Export</Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MiniStat label="Total In" value={formatINR(data?.totalIn ?? 0, { decimals: false })} accent="success" loading={isLoading} />
        <MiniStat label="Total Out" value={formatINR(data?.totalOut ?? 0, { decimals: false })} accent="danger" loading={isLoading} />
        <MiniStat label="Net" value={formatINR(data?.net ?? 0, { decimals: false })} accent={(data?.net ?? 0) >= 0 ? 'success' : 'danger'} loading={isLoading} />
      </div>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>
            Day Book — {range.from ? `${format(ist(range.from), 'dd MMM yyyy')} to ${format(ist(range.to!), 'dd MMM yyyy')}` : 'last 30 days'}
          </CardTitle>
        </CardHeader>
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
                    <TD className="whitespace-nowrap text-muted-foreground">{format(ist(e.date), 'dd MMM')}</TD>
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

const CASHBOOK_TYPE_META: Record<CashBookEntryType, { label: string; variant: 'success' | 'danger' | 'info' | 'neutral' }> = {
  RECEIPT: { label: 'Payment Received', variant: 'success' },
  POS_SALE: { label: 'POS Sale', variant: 'success' },
  EXPENSE: { label: 'Expense', variant: 'danger' },
  SUPPLIER_PAYMENT: { label: 'Supplier Payment', variant: 'danger' },
  ADJUSTMENT: { label: 'Adjustment', variant: 'neutral' },
};

/**
 * Physical cash-in-hand: opening balance, then every cash movement (who it came
 * from / went to) with a running balance, then the closing figure that should
 * match an actual count. See accounting.service.ts's getCashBook for the
 * per-source detail — this is the Day Book narrowed to cash only, plus manual
 * adjustments for the opening balance and physical-count corrections.
 */
function CashBookTab() {
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [custom, setCustom] = useState({ from: todayIso(), to: todayIso() });
  const range = periodRange(period, custom);
  const { data, isLoading } = useCashBook(range);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const deleteAdjustment = useDeleteCashAdjustment();

  const exportCsv = () => {
    if (!data) return;
    const rows: string[] = [
      ['Cash Book', range.from ? `${range.from} to ${range.to}` : 'Last 30 days'].map(csvCell).join(','),
      ['Opening Balance', '', '', '', '', data.openingBalance].map(csvCell).join(','),
      ['Date', 'Type', 'Source / Destination', 'Reference', 'In', 'Out', 'Balance'].join(','),
      ...data.entries.map((e) =>
        [format(ist(e.date), 'dd-MM-yyyy'), CASHBOOK_TYPE_META[e.type].label, e.description, e.reference ?? '', e.in || '', e.out || '', e.balance]
          .map(csvCell).join(','),
      ),
      ['Totals', '', '', '', data.totalIn, data.totalOut, ''].map(csvCell).join(','),
      ['Closing Balance', '', '', '', '', '', data.closingBalance].map(csvCell).join(','),
    ];
    // BOM so Excel opens UTF-8 correctly instead of mojibake.
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cash-book-${range.from ?? 'last-30-days'}${range.to && range.to !== range.from ? `_to_${range.to}` : ''}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const removeAdjustment = (id: string) => {
    if (!confirm('Remove this adjustment? This cannot be undone.')) return;
    deleteAdjustment.mutate(id, { onError: (e) => toast.error(apiErrorMessage(e)) });
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-3 print:hidden">
        <div className="space-y-1.5">
          <Label>Period</Label>
          <Select className="w-40" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
            {PERIODS.map(([key, label]) => <option key={key} value={key}>{key === 'all' ? 'Last 30 Days' : label}</option>)}
          </Select>
        </div>
        {period === 'custom' && (
          <>
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </div>
          </>
        )}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAdjustOpen(true)}><Settings2 className="h-4 w-4" /> Adjust Balance</Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print / PDF</Button>
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!data?.entries.length}><Download className="h-4 w-4" /> Export</Button>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <MiniStat label="Opening Balance" value={formatINR(data?.openingBalance ?? 0, { decimals: false })} accent={(data?.openingBalance ?? 0) >= 0 ? 'success' : 'danger'} loading={isLoading} />
        <MiniStat label="Cash In" value={formatINR(data?.totalIn ?? 0, { decimals: false })} accent="success" loading={isLoading} />
        <MiniStat label="Cash Out" value={formatINR(data?.totalOut ?? 0, { decimals: false })} accent="danger" loading={isLoading} />
        <MiniStat label="Closing Balance" value={formatINR(data?.closingBalance ?? 0, { decimals: false })} accent={(data?.closingBalance ?? 0) >= 0 ? 'success' : 'danger'} loading={isLoading} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>
            Cash Book — {range.from ? `${format(ist(range.from), 'dd MMM yyyy')} to ${format(ist(range.to!), 'dd MMM yyyy')}` : 'last 30 days'}
          </CardTitle>
        </CardHeader>
        {isLoading || !data ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH><TH>Type</TH><TH>Source / Destination</TH><TH>Reference</TH>
                <TH className="text-right">In</TH><TH className="text-right">Out</TH><TH className="text-right">Balance</TH><TH className="print:hidden" />
              </TR>
            </THead>
            <TBody>
              <TR className="bg-surface/60">
                <TD colSpan={6} className="font-medium">Opening Balance</TD>
                <TD className="text-right font-semibold tabular-nums">{formatINR(data.openingBalance)}</TD>
                <TD className="print:hidden" />
              </TR>
              {!data.entries.length ? (
                <TR>
                  <TD colSpan={8} className="py-10 text-center text-body text-muted-foreground">No cash transactions in this period.</TD>
                </TR>
              ) : (
                data.entries.map((e, i) => {
                  const m = CASHBOOK_TYPE_META[e.type];
                  return (
                    <TR key={i}>
                      <TD className="whitespace-nowrap text-muted-foreground">{format(ist(e.date), 'dd MMM')}</TD>
                      <TD><Badge variant={m.variant}>{m.label}</Badge></TD>
                      <TD className="font-medium">{e.description}</TD>
                      <TD className="text-muted-foreground">{e.reference ?? '—'}</TD>
                      <TD className="text-right text-success">{e.in ? formatINR(e.in) : ''}</TD>
                      <TD className="text-right text-danger">{e.out ? formatINR(e.out) : ''}</TD>
                      <TD className="text-right font-medium tabular-nums">{formatINR(e.balance)}</TD>
                      <TD className="text-right print:hidden">
                        {e.type === 'ADJUSTMENT' && e.sourceId && (
                          <Button variant="ghost" size="icon" title="Remove adjustment" onClick={() => removeAdjustment(e.sourceId!)}>
                            <Trash2 className="h-3.5 w-3.5 text-danger" />
                          </Button>
                        )}
                      </TD>
                    </TR>
                  );
                })
              )}
              <TR className="border-t-2 border-border bg-surface">
                <TD colSpan={6} className="font-semibold">Closing Balance</TD>
                <TD className="text-right font-extrabold tabular-nums">{formatINR(data.closingBalance)}</TD>
                <TD className="print:hidden" />
              </TR>
            </TBody>
          </Table>
        )}
      </Card>

      <AdjustCashDialog open={adjustOpen} onOpenChange={setAdjustOpen} />
    </div>
  );
}

function AdjustCashDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const add = useAddCashAdjustment();
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setDirection('add');
      setAmount(0);
      setDate(todayIso());
      setReason('');
    }
  }, [open]);

  const submit = () => {
    if (amount <= 0) { toast.error('Enter an amount greater than 0'); return; }
    if (!reason.trim()) { toast.error('A reason helps explain this later — e.g. "Opening balance" or "Shortage found on count"'); return; }
    add.mutate(
      { amount: direction === 'add' ? amount : -amount, adjustmentDate: date, reason: reason.trim() },
      {
        onSuccess: () => { toast.success('Balance adjusted'); onOpenChange(false); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Adjust Cash Balance</DialogTitle>
          <DialogDescription>
            Use this to set the opening balance the first time you use the Cash Book, or to correct it after a physical cash count.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setDirection('add')}
              className={cn('rounded-lg border p-2.5 text-body font-medium transition-colors', direction === 'add' ? 'border-success bg-success/10 text-success' : 'border-border text-muted-foreground')}
            >
              + Add to balance
            </button>
            <button
              type="button"
              onClick={() => setDirection('remove')}
              className={cn('rounded-lg border p-2.5 text-body font-medium transition-colors', direction === 'remove' ? 'border-danger bg-danger/10 text-danger' : 'border-border text-muted-foreground')}
            >
              − Remove from balance
            </button>
          </div>
          <div className="space-y-1.5">
            <Label>Amount (₹)</Label>
            <Input type="number" step="0.01" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Opening balance, or shortage found on count" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button loading={add.isPending} onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
