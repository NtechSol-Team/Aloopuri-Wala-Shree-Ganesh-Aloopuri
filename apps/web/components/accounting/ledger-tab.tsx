'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { BookOpen, Download, Printer, Search, Users, Store, Truck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR, ist, todayIso } from '@/lib/utils';
import { PERIODS, periodRange, type PeriodKey } from '@/lib/period';
import { useLedgerAccounts, useLedger, type LedgerAccountKind, type Ledger } from '@/hooks/useAccounting';

const KIND_META: Record<LedgerAccountKind, { label: string; icon: typeof Users }> = {
  PERSON: { label: 'People', icon: Users },
  OUTLET: { label: 'Franchises', icon: Store },
  SUPPLIER: { label: 'Suppliers', icon: Truck },
};

/**
 * How a balance should read for this kind of account. Outlets owe us; suppliers and
 * partners are owed by us — so the same positive number means opposite things and
 * needs saying out loud rather than leaving the reader to guess.
 */
function balanceLabel(kind: LedgerAccountKind, balance: number): string {
  if (balance === 0) return 'Settled';
  if (kind === 'OUTLET') return balance > 0 ? 'Receivable' : 'Advance held';
  if (kind === 'SUPPLIER') return balance > 0 ? 'Payable' : 'Overpaid';
  return balance > 0 ? 'Funded by them' : 'Reimbursed';
}

/** Escapes a CSV cell — quotes doubled, whole field quoted when it contains a delimiter. */
function csvCell(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function LedgerTab() {
  const { data: accounts, isLoading: accountsLoading } = useLedgerAccounts();
  const [accountId, setAccountId] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('all');
  const [custom, setCustom] = useState({ from: todayIso(), to: todayIso() });
  const [search, setSearch] = useState('');

  const range = periodRange(period, custom);
  // Default to the first account once they load, so the tab is never empty on open.
  const effectiveId = accountId || accounts?.[0]?.id || '';
  const { data: ledger, isLoading } = useLedger({
    accountId: effectiveId || undefined,
    ...range,
    ...(search.trim() ? { search: search.trim() } : {}),
  });

  const account = accounts?.find((a) => a.id === effectiveId);
  const grouped = useMemo(() => {
    const by: Record<LedgerAccountKind, typeof accounts> = { PERSON: [], OUTLET: [], SUPPLIER: [] };
    (accounts ?? []).forEach((a) => by[a.kind]?.push(a));
    return by;
  }, [accounts]);

  const exportCsv = () => {
    if (!ledger || !account) return;
    const rows: string[] = [
      [account.name, `Ledger`].map(csvCell).join(','),
      ['Opening Balance', '', '', '', '', ledger.openingBalance].map(csvCell).join(','),
      ['Date', 'Type', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'].join(','),
      ...ledger.entries.map((e) =>
        [format(ist(e.date), 'dd-MM-yyyy'), e.type, e.description, e.reference ?? '', e.debit || '', e.credit || '', e.balance]
          .map(csvCell).join(','),
      ),
      ['Totals', '', '', '', ledger.totalDebit, ledger.totalCredit, ''].map(csvCell).join(','),
      ['Closing Balance', '', '', '', '', '', ledger.closingBalance].map(csvCell).join(','),
    ];
    // BOM so Excel opens UTF-8 (Gujarati names) correctly instead of mojibake.
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledger-${account.name.replace(/[^\w]+/g, '-').toLowerCase()}-${todayIso()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-3 print:hidden">
        <div className="space-y-1.5">
          <Label>Account</Label>
          <Select className="w-64" value={effectiveId} onChange={(e) => setAccountId(e.target.value)}>
            {accountsLoading && <option>Loading…</option>}
            {(Object.keys(KIND_META) as LedgerAccountKind[]).map((kind) =>
              grouped[kind]?.length ? (
                <optgroup key={kind} label={KIND_META[kind].label}>
                  {grouped[kind]!.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </optgroup>
              ) : null,
            )}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Period</Label>
          <Select className="w-40" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
            {PERIODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
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
        <div className="space-y-1.5">
          <Label>Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input className="w-52 pl-8" placeholder="Description or reference…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
          <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!ledger}><Download className="h-4 w-4" /> Export</Button>
        </div>
      </Card>

      {isLoading || !ledger ? (
        <Card className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
            <div>
              <h3 className="text-card-title font-semibold">{account?.name ?? 'Ledger'}</h3>
              <p className="text-caption text-muted-foreground">
                {KIND_META[ledger.kind].label.replace(/s$/, '')} ledger
                {range.from ? ` · ${format(ist(range.from), 'dd MMM yyyy')} to ${format(ist(range.to!), 'dd MMM yyyy')}` : ' · all time'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-caption text-muted-foreground">Closing Balance</p>
              <p className={cn('text-xl font-extrabold tabular-nums', ledger.closingBalance > 0 ? 'text-danger' : 'text-success')}>
                {formatINR(Math.abs(ledger.closingBalance))}
              </p>
              <p className="text-caption text-muted-foreground">{balanceLabel(ledger.kind, ledger.closingBalance)}</p>
            </div>
          </div>

          <LedgerTable ledger={ledger} />
        </Card>
      )}
    </div>
  );
}

function LedgerTable({ ledger }: { ledger: Ledger }) {
  return (
    <Table>
      <THead>
        <TR>
          <TH className="w-28">Date</TH><TH>Description</TH><TH>Reference</TH>
          <TH className="text-right">Debit</TH><TH className="text-right">Credit</TH><TH className="text-right">Balance</TH>
        </TR>
      </THead>
      <TBody>
        <TR className="bg-surface/60">
          <TD colSpan={5} className="font-medium">Opening Balance</TD>
          <TD className="text-right font-semibold tabular-nums">{formatINR(ledger.openingBalance)}</TD>
        </TR>

        {!ledger.entries.length ? (
          <TR>
            <TD colSpan={6} className="py-10 text-center text-body text-muted-foreground">
              <BookOpen className="mx-auto mb-2 h-7 w-7" />
              No transactions in this period.
            </TD>
          </TR>
        ) : (
          ledger.entries.map((e, i) => (
            <TR key={`${e.sourceId ?? e.reference ?? 'row'}-${i}`}>
              <TD className="whitespace-nowrap text-muted-foreground">{format(ist(e.date), 'dd MMM yyyy')}</TD>
              <TD>
                <span className="font-medium">{e.description}</span>
                <span className="ml-2 text-caption text-muted-foreground">{e.type}</span>
              </TD>
              <TD className="text-muted-foreground">{e.reference ?? '—'}</TD>
              <TD className="text-right tabular-nums">{e.debit ? formatINR(e.debit) : '—'}</TD>
              <TD className="text-right tabular-nums">{e.credit ? formatINR(e.credit) : '—'}</TD>
              <TD className="text-right font-medium tabular-nums">{formatINR(e.balance)}</TD>
            </TR>
          ))
        )}

        <TR className="border-t-2 border-border bg-surface/60">
          <TD colSpan={3} className="font-semibold">Totals</TD>
          <TD className="text-right font-semibold tabular-nums">{formatINR(ledger.totalDebit)}</TD>
          <TD className="text-right font-semibold tabular-nums">{formatINR(ledger.totalCredit)}</TD>
          <TD />
        </TR>
        <TR className="bg-surface">
          <TD colSpan={5} className="font-semibold">Closing Balance</TD>
          <TD className="text-right font-extrabold tabular-nums">{formatINR(ledger.closingBalance)}</TD>
        </TR>
      </TBody>
    </Table>
  );
}
