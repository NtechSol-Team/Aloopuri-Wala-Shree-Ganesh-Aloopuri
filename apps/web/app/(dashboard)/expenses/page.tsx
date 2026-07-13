'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Trash2, TrendingUp, Plus, Check, Pencil, X } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { apiErrorMessage } from '@/lib/api';
import { formatINR } from '@/lib/utils';
import { useExpenseCategories, useCreateExpenseCategory, useExpenseSummary, useExpenses, useSaveExpense, useDeleteExpense, type ExpenseLocation } from '@/hooks/useExpenses';

const LOCATIONS: ExpenseLocation[] = ['GODOWN', 'MAIN_BRANCH', 'GENERAL'];
const METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD'];
const today = () => new Date().toISOString().slice(0, 10);

export default function ExpensesPage() {
  const [location, setLocation] = useState<ExpenseLocation | ''>('');
  const { data: summary, isLoading: sLoading } = useExpenseSummary({ location: location || undefined });
  const { data: expenses, isLoading } = useExpenses({ location: location || undefined });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select className="w-48" value={location} onChange={(e) => setLocation(e.target.value as ExpenseLocation | '')}>
          <option value="">All locations</option>
          {LOCATIONS.map((l) => <option key={l} value={l}>{l.replace('_', ' ')}</option>)}
        </Select>
        <p className="text-caption text-muted-foreground">Type a row below and press <kbd className="rounded border border-border bg-surface px-1">Enter</kbd> to add — like a spreadsheet.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {sLoading || !summary ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)
        ) : (
          <>
            <KpiCard label="Total Expenses" value={formatINR(summary.total, { decimals: false })} icon={TrendingUp} accent="danger" />
            {summary.byLocation.slice(0, 2).map((l) => (
              <KpiCard key={l.location} label={l.location.replace('_', ' ')} value={formatINR(l.total, { decimals: false })} icon={TrendingUp} accent="warning" />
            ))}
          </>
        )}
      </div>

      <Card className="overflow-hidden">
        <CardHeader><CardTitle>Expenses</CardTitle></CardHeader>
        <Table>
          <THead>
            <TR><TH className="w-36">Date</TH><TH>Category</TH><TH>Location</TH><TH>Paid To</TH><TH>Method</TH><TH className="text-right">Amount</TH><TH className="w-20" /></TR>
          </THead>
          <TBody>
            <InlineEntryRow />
            {isLoading ? (
              <TR><TD colSpan={7} className="py-4"><Skeleton className="h-8" /></TD></TR>
            ) : !expenses?.length ? (
              <TR><TD colSpan={7} className="py-10 text-center text-muted-foreground">No expenses yet — add your first one in the row above.</TD></TR>
            ) : (
              expenses.map((e) => <ExpenseRow key={e.id} expense={e} />)
            )}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader><CardTitle>Expenses by Category</CardTitle></CardHeader>
        <CardContent>
          {sLoading || !summary?.byCategory.length ? (
            <Skeleton className="h-64" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={summary.byCategory} margin={{ top: 8, right: 8, bottom: 40, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="category" angle={-30} textAnchor="end" interval={0} tick={{ fontSize: 11, fill: '#6B7280' }} height={60} />
                <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} />
                <Tooltip formatter={(v: number) => formatINR(v)} />
                <Bar dataKey="total" fill="#3730A3" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const inputCls = 'h-9 rounded-sm';

function InlineEntryRow() {
  const { data: categories } = useExpenseCategories();
  const createCategory = useCreateExpenseCategory();
  const save = useSaveExpense();
  const amountRef = useRef<HTMLInputElement>(null);
  const [row, setRow] = useState({ date: today(), categoryId: '', location: 'GENERAL', paidTo: '', paymentMethod: 'CASH', amount: '' });
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  useEffect(() => { if (categories?.length && !row.categoryId) setRow((r) => ({ ...r, categoryId: categories[0].id })); }, [categories, row.categoryId]);

  const add = () => {
    const amount = Number(row.amount);
    if (!row.categoryId) { toast.error('Pick a category'); return; }
    if (!amount || amount <= 0) { toast.error('Enter an amount'); amountRef.current?.focus(); return; }
    save.mutate(
      { categoryId: row.categoryId, amount, paymentMethod: row.paymentMethod, location: row.location, paidTo: row.paidTo || undefined, expenseDate: new Date(row.date).toISOString() },
      {
        onSuccess: () => {
          // Keep date/category/location/method for fast repeat entry; clear amount + paidTo.
          setRow((r) => ({ ...r, amount: '', paidTo: '' }));
          amountRef.current?.focus();
        },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  const addCategory = () => {
    const name = newCategory.trim();
    if (name.length < 2) { toast.error('Enter a category name'); return; }
    createCategory.mutate(name, {
      onSuccess: (c) => { setRow((r) => ({ ...r, categoryId: c.id })); setNewCategory(''); setAddingCategory(false); toast.success(`Category "${c.name}" added`); },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };

  return (
    <TR className="bg-accent/40 align-top">
      <TD><Input type="date" className={inputCls} value={row.date} onChange={(e) => setRow({ ...row, date: e.target.value })} onKeyDown={onKey} /></TD>
      <TD>
        {addingCategory ? (
          <div className="flex gap-1">
            <Input
              autoFocus className={inputCls} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } if (e.key === 'Escape') setAddingCategory(false); }}
            />
            <Button size="sm" className="h-9 shrink-0" loading={createCategory.isPending} onClick={addCategory}><Check className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="h-9 shrink-0" onClick={() => { setAddingCategory(false); setNewCategory(''); }}><X className="h-4 w-4" /></Button>
          </div>
        ) : (
          <div className="flex gap-1">
            <Select className={inputCls} value={row.categoryId} onChange={(e) => setRow({ ...row, categoryId: e.target.value })} onKeyDown={onKey}>
              {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0" title="New category" onClick={() => setAddingCategory(true)}><Plus className="h-4 w-4" /></Button>
          </div>
        )}
      </TD>
      <TD>
        <Select className={inputCls} value={row.location} onChange={(e) => setRow({ ...row, location: e.target.value })} onKeyDown={onKey}>
          {LOCATIONS.map((l) => <option key={l} value={l}>{l.replace('_', ' ')}</option>)}
        </Select>
      </TD>
      <TD><Input className={inputCls} placeholder="Paid to (optional)" value={row.paidTo} onChange={(e) => setRow({ ...row, paidTo: e.target.value })} onKeyDown={onKey} /></TD>
      <TD>
        <Select className={inputCls} value={row.paymentMethod} onChange={(e) => setRow({ ...row, paymentMethod: e.target.value })} onKeyDown={onKey}>
          {METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}
        </Select>
      </TD>
      <TD><Input ref={amountRef} type="number" step="0.01" className={`${inputCls} text-right`} placeholder="0.00" value={row.amount} onChange={(e) => setRow({ ...row, amount: e.target.value })} onKeyDown={onKey} /></TD>
      <TD>
        <Button size="sm" className="w-full" loading={save.isPending} onClick={add}><Plus className="h-4 w-4" /></Button>
      </TD>
    </TR>
  );
}

interface ExpenseRowData {
  id: string; amount: string; expenseDate: string; paymentMethod: string; paidTo: string | null; location: ExpenseLocation; category: { id: string; name: string };
}

function ExpenseRow({ expense }: { expense: ExpenseRowData }) {
  const { data: categories } = useExpenseCategories();
  const save = useSaveExpense();
  const del = useDeleteExpense();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ categoryId: expense.category.id, location: expense.location as string, paidTo: expense.paidTo ?? '', paymentMethod: expense.paymentMethod, amount: String(Number(expense.amount)) });

  const commit = () => {
    const amount = Number(draft.amount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    save.mutate(
      { id: expense.id, categoryId: draft.categoryId, location: draft.location, paymentMethod: draft.paymentMethod, paidTo: draft.paidTo || undefined, amount },
      { onSuccess: () => { toast.success('Updated'); setEditing(false); }, onError: (e) => toast.error(apiErrorMessage(e)) },
    );
  };

  if (editing) {
    return (
      <TR className="align-top">
        <TD className="text-muted-foreground">{format(new Date(expense.expenseDate), 'dd MMM yyyy')}</TD>
        <TD><Select className={inputCls} value={draft.categoryId} onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}>{categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></TD>
        <TD><Select className={inputCls} value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}>{LOCATIONS.map((l) => <option key={l} value={l}>{l.replace('_', ' ')}</option>)}</Select></TD>
        <TD><Input className={inputCls} value={draft.paidTo} onChange={(e) => setDraft({ ...draft, paidTo: e.target.value })} /></TD>
        <TD><Select className={inputCls} value={draft.paymentMethod} onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value })}>{METHODS.map((m) => <option key={m} value={m}>{m.replace('_', ' ')}</option>)}</Select></TD>
        <TD><Input type="number" step="0.01" className={`${inputCls} text-right`} value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} /></TD>
        <TD>
          <div className="flex gap-1">
            <Button size="icon" className="h-8 w-8" variant="success" loading={save.isPending} onClick={commit}><Check className="h-4 w-4" /></Button>
            <Button size="icon" className="h-8 w-8" variant="secondary" onClick={() => setEditing(false)}><X className="h-4 w-4" /></Button>
          </div>
        </TD>
      </TR>
    );
  }

  return (
    <TR className="group">
      <TD className="text-muted-foreground">{format(new Date(expense.expenseDate), 'dd MMM yyyy')}</TD>
      <TD className="cursor-pointer font-medium" onClick={() => setEditing(true)}>{expense.category.name}</TD>
      <TD><Badge variant="neutral">{expense.location.replace('_', ' ')}</Badge></TD>
      <TD className="text-muted-foreground">{expense.paidTo ?? '—'}</TD>
      <TD>{expense.paymentMethod.replace('_', ' ')}</TD>
      <TD className="cursor-pointer text-right font-medium" onClick={() => setEditing(true)}>{formatINR(expense.amount)}</TD>
      <TD>
        <div className="flex justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Delete" onClick={() => del.mutate(expense.id, { onSuccess: () => toast.success('Deleted'), onError: (e) => toast.error(apiErrorMessage(e)) })}><Trash2 className="h-4 w-4 text-danger" /></Button>
        </div>
      </TD>
    </TR>
  );
}
