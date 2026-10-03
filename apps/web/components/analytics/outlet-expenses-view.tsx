'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { ArrowLeft, Lock, Pencil, Plus, Trash2, Wallet, WalletCards } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR, ist, istDateInput, todayIso } from '@/lib/utils';
import { PERIODS, periodRange, type PeriodKey } from '@/lib/period';
import { apiErrorMessage } from '@/lib/api';
import {
  useOutletExpenses, useSaveOutletExpense, useDeleteOutletExpense, useSetOutletOpeningBalance,
  OUTLET_EXPENSE_METHOD_LABEL, OUTLET_EXPENSE_LOCATION_LABEL,
  type OutletExpenseRow, type OutletExpenseLocation, type OutletExpensePaymentMethod, type OutletExpensesResponse,
} from '@/hooks/useOutletExpenses';

const METHODS = Object.keys(OUTLET_EXPENSE_METHOD_LABEL) as OutletExpensePaymentMethod[];
const LOCATIONS = Object.keys(OUTLET_EXPENSE_LOCATION_LABEL) as OutletExpenseLocation[];

/**
 * The main owner's private running-cost ledger for one outlet: what it spent
 * (shop or godown), against what its POS took, down to a net profit. Lives
 * entirely outside company accounting — nothing here reaches the Day Book,
 * Cash Book or P&L.
 */
export function OutletExpensesView({ outletId, outletName, onBack }: { outletId: string; outletName: string; onBack: () => void }) {
  const [period, setPeriod] = useState<PeriodKey>('month');
  const [custom, setCustom] = useState({ from: todayIso(), to: todayIso() });
  const [location, setLocation] = useState<OutletExpenseLocation | ''>('');
  const [method, setMethod] = useState<OutletExpensePaymentMethod | ''>('');
  const [editing, setEditing] = useState<OutletExpenseRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [openingOpen, setOpeningOpen] = useState(false);
  const range = periodRange(period, custom);
  const { data, isLoading } = useOutletExpenses({
    outletId, ...range, location: location || undefined, paymentMethod: method || undefined,
  });
  const del = useDeleteOutletExpense();
  const periodLabel = PERIODS.find(([k]) => k === period)?.[1] ?? '';
  const filtered = !!(location || method);

  const remove = (r: OutletExpenseRow) => {
    if (!window.confirm(`Delete "${r.description}" (${formatINR(r.amount)})?`)) return;
    del.mutate(r.id, { onSuccess: () => toast.success('Expense deleted'), onError: (e) => toast.error(apiErrorMessage(e)) });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /> POS analytics</Button>
          <div>
            <p className="text-body font-semibold">{outletName} — Expenses</p>
            <p className="flex items-center gap-1 text-caption text-muted-foreground">
              <Lock className="h-3 w-3" /> Only you see this. Not part of company accounts.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOpeningOpen(true)}><WalletCards className="h-4 w-4" /> Opening Balance</Button>
          <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add Expense</Button>
        </div>
      </div>

      <Card className="flex flex-wrap items-end gap-3 p-3">
        <div className="space-y-1.5">
          <Label>Period</Label>
          <Select className="w-40" value={period} onChange={(e) => setPeriod(e.target.value as PeriodKey)}>
            {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </div>
        {period === 'custom' && (
          <>
            <div className="space-y-1.5">
              <Label>From</Label>
              <Input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>To</Label>
              <Input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            </div>
          </>
        )}
        <div className="space-y-1.5">
          <Label>Shop / Godown</Label>
          <Select className="w-36" value={location} onChange={(e) => setLocation(e.target.value as OutletExpenseLocation | '')}>
            <option value="">All</option>
            {LOCATIONS.map((l) => <option key={l} value={l}>{OUTLET_EXPENSE_LOCATION_LABEL[l]}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Payment</Label>
          <Select className="w-36" value={method} onChange={(e) => setMethod(e.target.value as OutletExpensePaymentMethod | '')}>
            <option value="">All</option>
            {METHODS.map((m) => <option key={m} value={m}>{OUTLET_EXPENSE_METHOD_LABEL[m]}</option>)}
          </Select>
        </div>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={() => { setLocation(''); setMethod(''); }}>Clear filters</Button>
        )}
      </Card>

      {isLoading || !data ? (
        <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>
      ) : (
        <>
          <ProfitStrip data={data} periodLabel={periodLabel} onSetOpening={() => setOpeningOpen(true)} />

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-4">
              <div>
                <h3 className="text-body font-semibold">Expense entries — {periodLabel}</h3>
                <p className="text-caption text-muted-foreground">
                  Shop {formatINR(data.byLocation.SHOP)} · Godown {formatINR(data.byLocation.GODOWN)}
                  {' · '}
                  {METHODS.filter((m) => data.byPaymentMethod[m] > 0).map((m) => `${OUTLET_EXPENSE_METHOD_LABEL[m]} ${formatINR(data.byPaymentMethod[m])}`).join(' · ') || 'No payments'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-caption uppercase tracking-wide text-muted-foreground">{filtered ? 'Filtered total' : 'Total'}</p>
                <p className="text-card-title font-bold text-danger">{formatINR(data.filteredTotal)}</p>
              </div>
            </div>
            {!data.rows.length ? (
              <div className="flex flex-col items-center gap-3 py-14 text-center">
                <Wallet className="h-7 w-7 text-muted-foreground" />
                <p className="text-body text-muted-foreground">No expenses {filtered ? 'match these filters' : 'in this period'}.</p>
                <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add Expense</Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>Date</TH><TH>Description</TH><TH>For</TH><TH>Payment</TH>
                      <TH className="text-right">Amount</TH><TH className="text-right">Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.rows.map((r) => (
                      <TR key={r.id}>
                        <TD className="whitespace-nowrap">{format(ist(r.expenseDate), 'dd MMM yyyy')}</TD>
                        <TD className="font-medium">{r.description}</TD>
                        <TD><Badge variant={r.location === 'SHOP' ? 'info' : 'warning'}>{OUTLET_EXPENSE_LOCATION_LABEL[r.location]}</Badge></TD>
                        <TD>{OUTLET_EXPENSE_METHOD_LABEL[r.paymentMethod]}</TD>
                        <TD className="text-right font-semibold tabular-nums">{formatINR(r.amount)}</TD>
                        <TD>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" title="Delete" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                          </div>
                        </TD>
                      </TR>
                    ))}
                    <TR className="bg-surface font-bold">
                      <TD colSpan={4}>{filtered ? 'Total (filtered)' : 'Total'}</TD>
                      <TD className="text-right tabular-nums">{formatINR(data.filteredTotal)}</TD>
                      <TD />
                    </TR>
                  </TBody>
                </Table>
              </div>
            )}
          </Card>
        </>
      )}

      <ExpenseDialog
        outletId={outletId}
        open={adding || !!editing}
        expense={editing}
        onClose={() => { setAdding(false); setEditing(null); }}
      />
      <OpeningBalanceDialog outletId={outletId} open={openingOpen} current={data?.opening ?? null} onClose={() => setOpeningOpen(false)} />
    </div>
  );
}

/** Opening → + POS sales → − expenses → net profit → closing, left to right. */
function ProfitStrip({ data, periodLabel, onSetOpening }: { data: OutletExpensesResponse; periodLabel: string; onSetOpening: () => void }) {
  const s = data.summary;
  const cells: Array<{ label: string; value: number; tone?: string; prefix?: string }> = [
    { label: 'Opening Balance', value: s.openingBalance },
    { label: `POS Sales (${periodLabel})`, value: s.posSales, tone: 'text-success', prefix: '+' },
    { label: 'Total Expenses', value: s.totalExpenses, tone: 'text-danger', prefix: '−' },
    { label: 'Net Profit', value: s.netProfit, tone: s.netProfit >= 0 ? 'text-success' : 'text-danger' },
    { label: 'Closing Balance', value: s.closingBalance },
  ];
  return (
    <Card className="p-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cells.map((c) => (
          <div key={c.label} className="min-w-0">
            <p className="text-caption uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className={cn('mt-1 break-words text-card-title font-bold tabular-nums', c.tone)}>
              {c.prefix && c.value > 0 ? `${c.prefix} ` : ''}{formatINR(c.value)}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-caption text-muted-foreground">
        Net profit = POS sales − expenses for the period (all shop and godown expenses, whatever the filters above).
        {data.opening
          ? ` Opening balance set to ${formatINR(data.opening.amount)} on ${format(ist(data.opening.asOfDate), 'dd MMM yyyy')}, carried forward month to month.`
          : ' '}
        {!data.opening && (
          <button type="button" className="font-medium text-primary hover:underline" onClick={onSetOpening}>Set an opening balance</button>
        )}
      </p>
    </Card>
  );
}

function ExpenseDialog({ outletId, open, expense, onClose }: {
  outletId: string; open: boolean; expense: OutletExpenseRow | null; onClose: () => void;
}) {
  const save = useSaveOutletExpense(outletId);
  const [form, setForm] = useState({
    expenseDate: todayIso(), description: '', amount: '',
    paymentMethod: 'CASH' as OutletExpensePaymentMethod, location: 'SHOP' as OutletExpenseLocation,
  });

  useEffect(() => {
    if (!open) return;
    setForm(expense
      ? { expenseDate: istDateInput(expense.expenseDate), description: expense.description, amount: String(expense.amount), paymentMethod: expense.paymentMethod, location: expense.location }
      : { expenseDate: todayIso(), description: '', amount: '', paymentMethod: 'CASH', location: 'SHOP' });
  }, [open, expense]);

  const submit = () => {
    const amount = Number(form.amount);
    if (!form.description.trim()) return toast.error('Enter a description');
    if (!(amount > 0)) return toast.error('Enter an amount greater than 0');
    save.mutate(
      { id: expense?.id, expenseDate: form.expenseDate, description: form.description.trim(), amount, paymentMethod: form.paymentMethod, location: form.location },
      {
        onSuccess: () => { toast.success(expense ? 'Expense updated' : 'Expense added'); onClose(); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{expense ? 'Edit Expense' : 'Add Expense'}</DialogTitle>
          <DialogDescription>Recorded for this outlet only — it won&apos;t appear in company accounts.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Expense for</Label>
            <div className="grid grid-cols-2 gap-2">
              {LOCATIONS.map((l) => (
                <button
                  key={l} type="button"
                  onClick={() => setForm((f) => ({ ...f, location: l }))}
                  className={cn(
                    'rounded-md border px-3 py-2 text-body font-medium transition-colors',
                    form.location === l ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-surface',
                  )}
                >
                  {OUTLET_EXPENSE_LOCATION_LABEL[l]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.expenseDate} max={todayIso()} onChange={(e) => setForm((f) => ({ ...f, expenseDate: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={form.description} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Gas cylinder, rent, staff tea" />
          </div>
          <div className="space-y-1.5">
            <Label>Payment type</Label>
            <Select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as OutletExpensePaymentMethod }))}>
              {METHODS.map((m) => <option key={m} value={m}>{OUTLET_EXPENSE_METHOD_LABEL[m]}</option>)}
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>{expense ? 'Save' : 'Add Expense'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpeningBalanceDialog({ outletId, open, current, onClose }: {
  outletId: string; open: boolean; current: OutletExpensesResponse['opening']; onClose: () => void;
}) {
  const save = useSetOutletOpeningBalance(outletId);
  const [form, setForm] = useState({ amount: '', asOfDate: todayIso(), notes: '' });

  useEffect(() => {
    if (!open) return;
    setForm(current
      ? { amount: String(current.amount), asOfDate: istDateInput(current.asOfDate), notes: current.notes ?? '' }
      : { amount: '', asOfDate: todayIso(), notes: '' });
  }, [open, current]);

  const submit = () => {
    const amount = Number(form.amount);
    if (form.amount.trim() === '' || !Number.isFinite(amount)) return toast.error('Enter the opening balance');
    save.mutate(
      { amount, asOfDate: form.asOfDate, notes: form.notes.trim() || undefined },
      { onSuccess: () => { toast.success('Opening balance saved'); onClose(); }, onError: (e) => toast.error(apiErrorMessage(e)) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Opening Balance</DialogTitle>
          <DialogDescription>
            The balance this outlet&apos;s ledger starts from. Sales and expenses after this date are carried forward on top of it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>As of date</Label>
              <Input type="date" value={form.asOfDate} onChange={(e) => setForm((f) => ({ ...f, asOfDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input value={form.notes} maxLength={300} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
