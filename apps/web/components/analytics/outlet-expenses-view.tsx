'use client';

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { ArrowLeft, HandCoins, Lock, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
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
import { apiErrorMessage } from '@/lib/api';
import { MONTH_NAMES } from '@/hooks/usePayroll';
import {
  useOutletMonthStatement, useSaveOutletExpense, useDeleteOutletExpense, useCreateOutletWithdrawal, useDeleteOutletWithdrawal,
  OUTLET_EXPENSE_METHOD_LABEL, OUTLET_EXPENSE_LOCATION_LABEL,
  type OutletExpenseRow, type OutletExpenseLocation, type OutletExpensePaymentMethod, type OutletMonthStatement,
} from '@/hooks/useOutletExpenses';

const METHODS = Object.keys(OUTLET_EXPENSE_METHOD_LABEL) as OutletExpensePaymentMethod[];
const LOCATIONS = Object.keys(OUTLET_EXPENSE_LOCATION_LABEL) as OutletExpenseLocation[];

const pad = (n: number) => String(n).padStart(2, '0');
/** Today if we're looking at the current month, otherwise that month's last day. */
function defaultDateFor(year: number, month: number): string {
  const today = todayIso();
  if (today.startsWith(`${year}-${pad(month)}`)) return today;
  return `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;
}
const monthBounds = (year: number, month: number) => ({
  min: `${year}-${pad(month)}-01`,
  max: `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`,
});

/**
 * The main owner's private month-by-month statement for one outlet: what its
 * shop took, what the shop and godown cost, the month's net profit, and how
 * much of that profit has been withdrawn. Every month starts from zero.
 * Lives entirely outside company accounting.
 */
export function OutletExpensesView({ outletId, outletName, onBack }: { outletId: string; outletName: string; onBack: () => void }) {
  const [cy, cm] = todayIso().split('-').map(Number);
  const [year, setYear] = useState(cy);
  const [month, setMonth] = useState(cm);
  const [location, setLocation] = useState<OutletExpenseLocation | ''>('');
  const [method, setMethod] = useState<OutletExpensePaymentMethod | ''>('');
  const [editing, setEditing] = useState<OutletExpenseRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const { data, isLoading } = useOutletMonthStatement({
    outletId, year, month, location: location || undefined, paymentMethod: method || undefined,
  });
  const delExpense = useDeleteOutletExpense();
  const delWithdrawal = useDeleteOutletWithdrawal();
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  const filtered = !!(location || method);
  const years = Array.from({ length: cy - 2024 }, (_, i) => cy - i);
  const pickYear = (y: number) => { setYear(y); if (y === cy && month > cm) setMonth(cm); };

  const removeExpense = (r: OutletExpenseRow) => {
    if (!window.confirm(`Delete "${r.description}" (${formatINR(r.amount)})?`)) return;
    delExpense.mutate(r.id, { onSuccess: () => toast.success('Expense deleted'), onError: (e) => toast.error(apiErrorMessage(e)) });
  };
  const removeWithdrawal = (id: string, amount: number) => {
    if (!window.confirm(`Delete this withdrawal of ${formatINR(amount)}? It goes back into the pending amount.`)) return;
    delWithdrawal.mutate(id, { onSuccess: () => toast.success('Withdrawal deleted'), onError: (e) => toast.error(apiErrorMessage(e)) });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" /> POS analytics</Button>
          <div>
            <p className="text-body font-semibold">{outletName} — Monthly Profit</p>
            <p className="flex items-center gap-1 text-caption text-muted-foreground">
              <Lock className="h-3 w-3" /> Only you see this. Not part of company accounts.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select className="w-36" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label="Month">
            {MONTH_NAMES.map((name, i) => (year === cy && i + 1 > cm ? null : <option key={name} value={i + 1}>{name}</option>))}
          </Select>
          <Select className="w-28" value={year} onChange={(e) => pickYear(Number(e.target.value))} aria-label="Year">
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add Expense</Button>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <MonthStatementCard data={data} monthLabel={monthLabel} />
            <WithdrawalsCard
              data={data}
              monthLabel={monthLabel}
              onWithdraw={() => setWithdrawing(true)}
              onDelete={removeWithdrawal}
            />
          </div>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-4">
              <div>
                <h3 className="text-body font-semibold">Expenses — {monthLabel}</h3>
                <p className="text-caption text-muted-foreground">
                  Shop {formatINR(data.byLocation.SHOP)} · Godown {formatINR(data.byLocation.GODOWN)}
                  {METHODS.some((m) => data.byPaymentMethod[m] > 0) && ' · '}
                  {METHODS.filter((m) => data.byPaymentMethod[m] > 0).map((m) => `${OUTLET_EXPENSE_METHOD_LABEL[m]} ${formatINR(data.byPaymentMethod[m])}`).join(' · ')}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-caption">Shop / Godown</Label>
                  <Select className="h-9 w-32" value={location} onChange={(e) => setLocation(e.target.value as OutletExpenseLocation | '')}>
                    <option value="">All</option>
                    {LOCATIONS.map((l) => <option key={l} value={l}>{OUTLET_EXPENSE_LOCATION_LABEL[l]}</option>)}
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-caption">Payment</Label>
                  <Select className="h-9 w-32" value={method} onChange={(e) => setMethod(e.target.value as OutletExpensePaymentMethod | '')}>
                    <option value="">All</option>
                    {METHODS.map((m) => <option key={m} value={m}>{OUTLET_EXPENSE_METHOD_LABEL[m]}</option>)}
                  </Select>
                </div>
                {filtered && <Button variant="ghost" size="sm" onClick={() => { setLocation(''); setMethod(''); }}>Clear</Button>}
                <div className="pl-2 text-right">
                  <p className="text-caption uppercase tracking-wide text-muted-foreground">{filtered ? 'Filtered total' : 'Total'}</p>
                  <p className="text-card-title font-bold text-danger">{formatINR(data.filteredTotal)}</p>
                </div>
              </div>
            </div>
            {!data.rows.length ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Wallet className="h-7 w-7 text-muted-foreground" />
                <p className="text-body text-muted-foreground">No expenses {filtered ? 'match these filters' : `in ${monthLabel}`}.</p>
                {!filtered && <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add Expense</Button>}
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
                            <Button variant="ghost" size="icon" title="Delete" onClick={() => removeExpense(r)}><Trash2 className="h-4 w-4 text-danger" /></Button>
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
        defaultDate={defaultDateFor(year, month)}
        onClose={() => { setAdding(false); setEditing(null); }}
      />
      {data && (
        <WithdrawDialog
          outletId={outletId}
          open={withdrawing}
          year={year}
          month={month}
          monthLabel={monthLabel}
          pending={data.summary.pending}
          onClose={() => setWithdrawing(false)}
        />
      )}
    </div>
  );
}

function StatementLine({ label, value, sign, tone, strong, sub }: {
  label: string; value: number; sign?: '−' | '='; tone?: string; strong?: boolean; sub?: string;
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-3 py-2', strong && 'border-t border-border pt-3')}>
      <div className="min-w-0">
        <p className={cn('text-body', strong ? 'font-semibold' : 'text-muted-foreground')}>
          {sign && <span className="mr-1.5 inline-block w-3 text-center">{sign}</span>}{label}
        </p>
        {sub && <p className="pl-[18px] text-caption text-muted-foreground">{sub}</p>}
      </div>
      <p className={cn('shrink-0 tabular-nums', strong ? 'text-card-title font-bold' : 'text-body font-semibold', tone)}>{formatINR(value)}</p>
    </div>
  );
}

/** Revenue down to pending, in the order the month actually happened. */
function MonthStatementCard({ data, monthLabel }: { data: OutletMonthStatement; monthLabel: string }) {
  const s = data.summary;
  return (
    <Card className="p-5">
      <h3 className="text-body font-semibold">{monthLabel} statement</h3>
      <p className="text-caption text-muted-foreground">Every month starts from zero — nothing carries over.</p>
      <div className="mt-3">
        <StatementLine label="Shop Revenue (POS sales)" value={s.shopRevenue} tone="text-success" />
        <StatementLine label="Shop Expenses" value={s.shopExpenses} sign="−" tone="text-danger" />
        <StatementLine label="Godown Expenses" value={s.godownExpenses} sign="−" tone="text-danger" />
        <StatementLine label="Net Profit" value={s.netProfit} sign="=" strong tone={s.netProfit >= 0 ? 'text-success' : 'text-danger'} />
        <StatementLine label="Withdrawn" value={s.withdrawn} sign="−" />
        <StatementLine
          label="Pending"
          sub={s.pending < 0 ? 'More was withdrawn than this month earned' : 'Profit not withdrawn yet'}
          value={s.pending}
          sign="="
          strong
          tone={s.pending < 0 ? 'text-danger' : 'text-primary'}
        />
      </div>
    </Card>
  );
}

function WithdrawalsCard({ data, monthLabel, onWithdraw, onDelete }: {
  data: OutletMonthStatement; monthLabel: string; onWithdraw: () => void; onDelete: (id: string, amount: number) => void;
}) {
  const pending = data.summary.pending;
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border p-5">
        <div>
          <h3 className="text-body font-semibold">Withdrawals — {monthLabel}</h3>
          <p className="text-caption text-muted-foreground">
            Pending to withdraw: <span className={cn('font-semibold', pending < 0 ? 'text-danger' : 'text-foreground')}>{formatINR(pending)}</span>
          </p>
        </div>
        <Button size="sm" onClick={onWithdraw} disabled={pending <= 0}><HandCoins className="h-4 w-4" /> Withdraw</Button>
      </div>
      {!data.withdrawals.length ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <HandCoins className="h-7 w-7 text-muted-foreground" />
          <p className="text-body text-muted-foreground">Nothing withdrawn from {monthLabel} yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <TR><TH>Date</TH><TH>Payment</TH><TH>Notes</TH><TH className="text-right">Amount</TH><TH /></TR>
            </THead>
            <TBody>
              {data.withdrawals.map((w) => (
                <TR key={w.id}>
                  <TD className="whitespace-nowrap">{format(ist(w.withdrawDate), 'dd MMM yyyy')}</TD>
                  <TD>{OUTLET_EXPENSE_METHOD_LABEL[w.paymentMethod]}</TD>
                  <TD className="text-caption text-muted-foreground">{w.notes || '—'}</TD>
                  <TD className="text-right font-semibold tabular-nums">{formatINR(w.amount)}</TD>
                  <TD className="text-right">
                    <Button variant="ghost" size="icon" title="Delete" onClick={() => onDelete(w.id, w.amount)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </TD>
                </TR>
              ))}
              <TR className="bg-surface font-bold">
                <TD colSpan={3}>Total withdrawn</TD>
                <TD className="text-right tabular-nums">{formatINR(data.summary.withdrawn)}</TD>
                <TD />
              </TR>
            </TBody>
          </Table>
        </div>
      )}
    </Card>
  );
}

function WithdrawDialog({ outletId, open, year, month, monthLabel, pending, onClose }: {
  outletId: string; open: boolean; year: number; month: number; monthLabel: string; pending: number; onClose: () => void;
}) {
  const save = useCreateOutletWithdrawal(outletId);
  const [form, setForm] = useState({ amount: '', withdrawDate: todayIso(), paymentMethod: 'CASH' as OutletExpensePaymentMethod, notes: '' });

  useEffect(() => {
    if (!open) return;
    setForm({ amount: pending > 0 ? String(Math.round(pending * 100) / 100) : '', withdrawDate: defaultDateFor(year, month), paymentMethod: 'CASH', notes: '' });
  }, [open, pending, year, month]);

  const submit = () => {
    const amount = Number(form.amount);
    if (!(amount > 0)) return toast.error('Enter an amount greater than 0');
    if (amount > pending + 0.001) return toast.error(`Only ${formatINR(pending)} is pending for ${monthLabel}`);
    save.mutate(
      { year, month, withdrawDate: form.withdrawDate, amount, paymentMethod: form.paymentMethod, notes: form.notes.trim() || undefined },
      { onSuccess: () => { toast.success('Withdrawal recorded'); onClose(); }, onError: (e) => toast.error(apiErrorMessage(e)) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw from {monthLabel} profit</DialogTitle>
          <DialogDescription>Pending: {formatINR(pending)}. Withdrawing reduces this month&apos;s pending amount only.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount (₹)</Label>
              <Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Date taken</Label>
              <Input type="date" value={form.withdrawDate} min={monthBounds(year, month).min} max={todayIso()} onChange={(e) => setForm((f) => ({ ...f, withdrawDate: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Payment type</Label>
            <Select value={form.paymentMethod} onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value as OutletExpensePaymentMethod }))}>
              {METHODS.map((m) => <option key={m} value={m}>{OUTLET_EXPENSE_METHOD_LABEL[m]}</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Input value={form.notes} maxLength={300} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>Withdraw</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseDialog({ outletId, open, expense, defaultDate, onClose }: {
  outletId: string; open: boolean; expense: OutletExpenseRow | null; defaultDate: string; onClose: () => void;
}) {
  const save = useSaveOutletExpense(outletId);
  const [form, setForm] = useState({
    expenseDate: defaultDate, description: '', amount: '',
    paymentMethod: 'CASH' as OutletExpensePaymentMethod, location: 'SHOP' as OutletExpenseLocation,
  });

  useEffect(() => {
    if (!open) return;
    setForm(expense
      ? { expenseDate: istDateInput(expense.expenseDate), description: expense.description, amount: String(expense.amount), paymentMethod: expense.paymentMethod, location: expense.location }
      : { expenseDate: defaultDate, description: '', amount: '', paymentMethod: 'CASH', location: 'SHOP' });
  }, [open, expense, defaultDate]);

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
