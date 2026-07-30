'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Users, CalendarCheck, Wallet, BarChart3, FileText, Play, Check, Undo2,
  Download, Pencil,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useEmployees, SALARY_TYPE_LABEL } from '@/hooks/useEmployees';
import {
  useAttendance, useSaveAttendance, usePayroll, useGeneratePayroll, useUpdatePayroll,
  useMarkPayrollPaid, useRevertPayroll, usePayrollDashboard, openPayslip, downloadCsv,
  useEmployeeMasterReport, useAttendanceReport, useSalaryRegisterReport, useMonthlySummaryReport,
  MONTH_NAMES, type AttendanceRow, type PayrollRow, type Period,
} from '@/hooks/usePayroll';

type Tab = 'dashboard' | 'attendance' | 'salary' | 'reports';

const TABS: Array<[Tab, string, typeof Users]> = [
  ['dashboard', 'Dashboard', BarChart3],
  ['attendance', 'Attendance', CalendarCheck],
  ['salary', 'Salary', Wallet],
  ['reports', 'Reports', FileText],
];

const now = new Date();
const today = () => new Date().toISOString().slice(0, 10);

export default function PayrollPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [period, setPeriod] = useState<Period>({ year: now.getFullYear(), month: now.getMonth() + 1 });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1 scrollbar-thin">
          {TABS.map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-caption font-medium transition-colors',
                tab === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-surface',
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
        {tab !== 'reports' && <PeriodPicker period={period} onChange={setPeriod} />}
      </div>

      {tab === 'dashboard' && <DashboardTab period={period} />}
      {tab === 'attendance' && <AttendanceTab period={period} />}
      {tab === 'salary' && <SalaryTab period={period} />}
      {tab === 'reports' && <ReportsTab />}
    </div>
  );
}

function PeriodPicker({ period, onChange }: { period: Period; onChange: (p: Period) => void }) {
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);
  return (
    <div className="flex gap-2">
      <Select className="w-36" value={String(period.month)} onChange={(e) => onChange({ ...period, month: Number(e.target.value) })}>
        {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </Select>
      <Select className="w-28" value={String(period.year)} onChange={(e) => onChange({ ...period, year: Number(e.target.value) })}>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </Select>
    </div>
  );
}

// ───────────────────────────── Dashboard ────────────────────────────────────
function DashboardTab({ period }: { period: Period }) {
  const { data, isLoading } = usePayrollDashboard(period);

  if (isLoading || !data) {
    return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-28" />)}</div>;
  }

  const a = data.attendance;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Employees" value={String(data.totalEmployees)} icon={Users} accent="primary" />
        <KpiCard label="Active Employees" value={String(data.activeEmployees)} icon={Users} accent="primary" />
        <KpiCard label="Payroll Processed" value={String(data.payrollProcessed)} icon={Check} accent="primary" />
        <KpiCard label="Payroll Pending" value={String(data.payrollPending)} icon={Wallet} accent={data.payrollPending > 0 ? 'danger' : 'primary'} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <p className="text-caption uppercase tracking-wide text-muted-foreground">Salary paid · {data.period}</p>
          <p className="mt-1 text-2xl font-extrabold">{formatINR(data.totalSalaryExpense)}</p>
          <p className="mt-1 text-caption text-muted-foreground">
            {data.pendingSalaryAmount > 0 ? `${formatINR(data.pendingSalaryAmount)} still pending` : 'Nothing pending'}
          </p>
        </Card>

        <Card className="p-4 lg:col-span-2">
          <p className="mb-3 text-caption uppercase tracking-wide text-muted-foreground">Attendance summary · {data.period}</p>
          {a.employeesRecorded === 0 ? (
            <p className="text-body text-muted-foreground">No attendance recorded for this month yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {[
                ['Present', a.presentDays], ['Absent', a.absentDays], ['Half days', a.halfDays],
                ['Paid leave', a.paidLeave], ['Unpaid leave', a.unpaidLeave], ['OT hours', a.overtimeHours],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-md border border-border p-2 text-center">
                  <p className="text-caption text-muted-foreground">{label as string}</p>
                  <p className="text-label font-bold">{value as number}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <p className="mb-3 text-caption uppercase tracking-wide text-muted-foreground">Employees by department</p>
        {!data.byDepartment.length ? (
          <p className="text-body text-muted-foreground">No active employees yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.byDepartment.map((d) => (
              <div key={d.department} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
                <span className="text-body">{d.department}</span>
                <Badge variant="info">{d.count}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ───────────────────────────── Attendance ───────────────────────────────────
function AttendanceTab({ period }: { period: Period }) {
  const { data: employees } = useEmployees({ status: 'ACTIVE' });
  const { data: attendance, isLoading } = useAttendance(period);
  const [editing, setEditing] = useState<{ employeeId: string; name: string; existing?: AttendanceRow } | null>(null);

  const byEmployee = useMemo(
    () => new Map((attendance ?? []).map((a) => [a.employeeId, a])),
    [attendance],
  );

  const rows = employees ?? [];

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body text-muted-foreground">
          Enter each employee&apos;s attendance for {MONTH_NAMES[period.month - 1]} {period.year}. Payroll uses these figures.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !rows.length ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="text-body text-muted-foreground">No active employees. Add them under Employees first.</p>
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Employee</TH><TH>Salary type</TH><TH className="text-right">Working days</TH>
              <TH className="text-right">Present</TH><TH className="text-right">Absent</TH><TH className="text-right">Half</TH>
              <TH className="text-right">Paid leave</TH><TH className="text-right">Unpaid</TH><TH className="text-right">OT hrs</TH>
              <TH className="text-right">Payable</TH><TH className="text-right">Action</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((e) => {
              const a = byEmployee.get(e.id);
              return (
                <TR key={e.id}>
                  <TD className="font-medium">
                    {e.name}
                    <span className="ml-1.5 text-caption text-muted-foreground">{e.employeeNo}</span>
                  </TD>
                  <TD className="text-caption">{SALARY_TYPE_LABEL[e.salaryType]}</TD>
                  {a ? (
                    <>
                      <TD className="text-right">{Number(a.totalWorkingDays)}</TD>
                      <TD className="text-right">{Number(a.presentDays)}</TD>
                      <TD className="text-right">{Number(a.absentDays)}</TD>
                      <TD className="text-right">{Number(a.halfDays)}</TD>
                      <TD className="text-right">{Number(a.paidLeave)}</TD>
                      <TD className="text-right">{Number(a.unpaidLeave)}</TD>
                      <TD className="text-right">{Number(a.overtimeHours)}</TD>
                      <TD className="text-right font-semibold">{a.payableDays}</TD>
                    </>
                  ) : (
                    <TD className="text-center text-caption text-muted-foreground" colSpan={8}>Not recorded</TD>
                  )}
                  <TD className="text-right">
                    <Button size="sm" variant={a ? 'ghost' : 'secondary'} onClick={() => setEditing({ employeeId: e.id, name: e.name, existing: a })}>
                      {a ? <Pencil className="h-3.5 w-3.5" /> : 'Enter'}
                    </Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <AttendanceDialog
        target={editing}
        period={period}
        onClose={() => setEditing(null)}
      />
    </Card>
  );
}

/** Working days default to the calendar month minus Sundays — the usual shop week. */
function defaultWorkingDays(year: number, month: number): number {
  const days = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) if (new Date(year, month - 1, d).getDay() !== 0) count++;
  return count;
}

function AttendanceDialog({ target, period, onClose }: {
  target: { employeeId: string; name: string; existing?: AttendanceRow } | null;
  period: Period;
  onClose: () => void;
}) {
  const save = useSaveAttendance();
  const [form, setForm] = useState({
    totalWorkingDays: 26, presentDays: 0, absentDays: 0, halfDays: 0,
    paidLeave: 0, unpaidLeave: 0, overtimeHours: 0, workingHours: 0, notes: '',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!target) return;
    const e = target.existing;
    setForm(
      e
        ? {
            totalWorkingDays: Number(e.totalWorkingDays), presentDays: Number(e.presentDays),
            absentDays: Number(e.absentDays), halfDays: Number(e.halfDays),
            paidLeave: Number(e.paidLeave), unpaidLeave: Number(e.unpaidLeave),
            overtimeHours: Number(e.overtimeHours), workingHours: Number(e.workingHours ?? 0),
            notes: e.notes ?? '',
          }
        : {
            totalWorkingDays: defaultWorkingDays(period.year, period.month),
            presentDays: 0, absentDays: 0, halfDays: 0, paidLeave: 0, unpaidLeave: 0,
            overtimeHours: 0, workingHours: 0, notes: '',
          },
    );
  }, [target, period]);

  if (!target) return null;

  const counted = form.presentDays + form.absentDays + form.halfDays + form.paidLeave + form.unpaidLeave;
  const over = counted > form.totalWorkingDays;
  const payable = form.presentDays + form.paidLeave + form.halfDays / 2;

  const submit = () => {
    if (over) { toast.error(`Days entered (${counted}) exceed ${form.totalWorkingDays} working days`); return; }
    save.mutate(
      { employeeId: target.employeeId, year: period.year, month: period.month, ...form, notes: form.notes || undefined },
      {
        onSuccess: () => { toast.success('Attendance saved'); onClose(); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{target.name} — {MONTH_NAMES[period.month - 1]} {period.year}</DialogTitle>
          <DialogDescription>Payable days are worked out as present + paid leave + half the half-days.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Num label="Total working days" value={form.totalWorkingDays} onChange={(v) => set('totalWorkingDays', v)} />
          <Num label="Present days" value={form.presentDays} onChange={(v) => set('presentDays', v)} />
          <Num label="Absent days" value={form.absentDays} onChange={(v) => set('absentDays', v)} />
          <Num label="Half days" value={form.halfDays} onChange={(v) => set('halfDays', v)} />
          <Num label="Paid leave" value={form.paidLeave} onChange={(v) => set('paidLeave', v)} />
          <Num label="Unpaid leave" value={form.unpaidLeave} onChange={(v) => set('unpaidLeave', v)} />
          <Num label="Overtime hours" value={form.overtimeHours} onChange={(v) => set('overtimeHours', v)} step={0.5} />
          <Num label="Working hours (hourly staff)" value={form.workingHours} onChange={(v) => set('workingHours', v)} step={0.5} />
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        <div className={cn('rounded-md border px-3 py-2 text-body', over ? 'border-danger bg-danger/10 text-danger' : 'border-border bg-surface')}>
          {over
            ? `Days entered (${counted}) exceed the ${form.totalWorkingDays} working days.`
            : <>Payable days: <span className="font-semibold">{payable}</span> of {form.totalWorkingDays}</>}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending} disabled={over}>Save Attendance</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Num({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" min={0} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

// ─────────────────────────────── Salary ─────────────────────────────────────
function SalaryTab({ period }: { period: Period }) {
  const { data, isLoading } = usePayroll(period);
  const generate = useGeneratePayroll();
  const markPaid = useMarkPayrollPaid();
  const revert = useRevertPayroll();
  const [adjusting, setAdjusting] = useState<PayrollRow | null>(null);

  const rows = data?.rows ?? [];
  const totals = data?.totals;

  const runGenerate = () =>
    generate.mutate(period, {
      onSuccess: (r) => {
        const parts = [`${r.created} created`, `${r.updated} updated`];
        if (r.skippedPaid) parts.push(`${r.skippedPaid} already paid (left alone)`);
        toast.success(`${r.period}: ${parts.join(', ')}`);
        if (r.skippedNoAttendance.length) {
          toast(`No attendance for: ${r.skippedNoAttendance.join(', ')}`, { icon: '⚠️', duration: 7000 });
        }
      },
      onError: (e) => toast.error(apiErrorMessage(e)),
    });

  const pay = (row: PayrollRow) =>
    markPaid.mutate(
      { id: row.id, paymentDate: today() },
      {
        onSuccess: () => toast.success(`${row.employee.name} — salary marked paid and booked as an expense`),
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );

  const undo = (row: PayrollRow) => {
    if (!window.confirm(`Undo payment for ${row.employee.name}? The booked expense will be removed.`)) return;
    revert.mutate(row.id, {
      onSuccess: () => toast.success('Payment reverted'),
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-body">
            Generate salary for <span className="font-semibold">{MONTH_NAMES[period.month - 1]} {period.year}</span>
          </p>
          <p className="text-caption text-muted-foreground">
            Uses each employee&apos;s salary structure and this month&apos;s attendance. Already-paid rows are never restated.
          </p>
        </div>
        <Button onClick={runGenerate} loading={generate.isPending}><Play className="h-4 w-4" /> Generate Salary</Button>
      </Card>

      {totals && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Gross" value={formatINR(totals.gross)} icon={Wallet} accent="primary" />
          <KpiCard label="Net Payable" value={formatINR(totals.net)} icon={Wallet} accent="primary" />
          <KpiCard label="Paid" value={formatINR(totals.paid)} icon={Check} accent="primary" />
          <KpiCard label="Pending" value={formatINR(totals.pending)} icon={Wallet} accent={totals.pending > 0 ? 'danger' : 'primary'} />
        </div>
      )}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Wallet className="h-8 w-8 text-muted-foreground" />
            <p className="text-body text-muted-foreground">No salary generated for this month yet.</p>
            <p className="text-caption text-muted-foreground">Enter attendance first, then click Generate Salary.</p>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Payroll #</TH><TH>Employee</TH><TH>Basis</TH>
                <TH className="text-right">Payable days</TH><TH className="text-right">Gross</TH>
                <TH className="text-right">Additions</TH><TH className="text-right">Deductions</TH>
                <TH className="text-right">Net</TH><TH>Status</TH><TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => {
                const additions = Number(r.allowances) + Number(r.overtimeAmount) + Number(r.bonus) + Number(r.incentives);
                const subtractions = Number(r.deductions) + Number(r.advanceRecovery) + Number(r.loanRecovery);
                const isPaid = r.status === 'PAID';
                return (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.payrollNo}</TD>
                    <TD>
                      {r.employee.name}
                      <span className="ml-1.5 text-caption text-muted-foreground">{r.employee.employeeNo}</span>
                    </TD>
                    <TD className="text-caption">{SALARY_TYPE_LABEL[r.salaryType]}</TD>
                    <TD className="text-right">{Number(r.payableDays)} / {Number(r.totalWorkingDays)}</TD>
                    <TD className="text-right">{formatINR(r.grossSalary)}</TD>
                    <TD className="text-right text-success">{additions > 0 ? `+${formatINR(additions)}` : '—'}</TD>
                    <TD className="text-right text-danger">{subtractions > 0 ? `-${formatINR(subtractions)}` : '—'}</TD>
                    <TD className="text-right font-semibold">{formatINR(r.netSalary)}</TD>
                    <TD>
                      <Badge variant={isPaid ? 'success' : 'warning'}>{isPaid ? 'Paid' : 'Pending'}</Badge>
                      {r.paymentDate && <span className="ml-1.5 text-caption text-muted-foreground">{format(new Date(r.paymentDate), 'dd MMM')}</span>}
                    </TD>
                    <TD>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" title="Salary slip" onClick={() => openPayslip(r.id, r.payrollNo).catch((e) => toast.error(apiErrorMessage(e)))}>
                          <Download className="h-4 w-4" />
                        </Button>
                        {!isPaid && (
                          <>
                            <Button variant="ghost" size="icon" title="Adjust bonus / deductions" onClick={() => setAdjusting(r)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="sm" loading={markPaid.isPending} onClick={() => pay(r)}><Check className="h-3.5 w-3.5" /> Pay</Button>
                          </>
                        )}
                        {isPaid && (
                          <Button variant="ghost" size="icon" title="Undo payment" onClick={() => undo(r)}><Undo2 className="h-4 w-4 text-danger" /></Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <AdjustDialog row={adjusting} onClose={() => setAdjusting(null)} />
    </div>
  );
}

function AdjustDialog({ row, onClose }: { row: PayrollRow | null; onClose: () => void }) {
  const update = useUpdatePayroll();
  const [form, setForm] = useState({ allowances: 0, deductions: 0, bonus: 0, incentives: 0, advanceRecovery: 0, loanRecovery: 0 });
  const set = <K extends keyof typeof form>(k: K, v: number) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!row) return;
    setForm({
      allowances: Number(row.allowances), deductions: Number(row.deductions),
      bonus: Number(row.bonus), incentives: Number(row.incentives),
      advanceRecovery: Number(row.advanceRecovery), loanRecovery: Number(row.loanRecovery),
    });
  }, [row]);

  if (!row) return null;

  const preview =
    Number(row.grossSalary) + form.allowances + Number(row.overtimeAmount) + form.bonus + form.incentives
    - form.deductions - form.advanceRecovery - form.loanRecovery;

  const submit = () =>
    update.mutate(
      { id: row.id, ...form },
      {
        onSuccess: () => { toast.success('Payroll updated'); onClose(); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust {row.payrollNo}</DialogTitle>
          <DialogDescription>{row.employee.name} · gross {formatINR(row.grossSalary)} · overtime {formatINR(row.overtimeAmount)}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Num label="Allowances (₹)" value={form.allowances} onChange={(v) => set('allowances', v)} step={0.01} />
          <Num label="Bonus (₹)" value={form.bonus} onChange={(v) => set('bonus', v)} step={0.01} />
          <Num label="Incentives (₹)" value={form.incentives} onChange={(v) => set('incentives', v)} step={0.01} />
          <Num label="Deductions (₹)" value={form.deductions} onChange={(v) => set('deductions', v)} step={0.01} />
          <Num label="Advance recovery (₹)" value={form.advanceRecovery} onChange={(v) => set('advanceRecovery', v)} step={0.01} />
          <Num label="Loan recovery (₹)" value={form.loanRecovery} onChange={(v) => set('loanRecovery', v)} step={0.01} />
        </div>

        <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2">
          <span className="text-body">Net salary</span>
          <span className="text-label font-bold">{formatINR(Math.max(0, preview))}</span>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={update.isPending}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────── Reports ────────────────────────────────────
type ReportKey = 'employees' | 'attendance' | 'payroll' | 'register' | 'monthly' | 'leave';

const REPORTS: Array<[ReportKey, string]> = [
  ['employees', 'Employee Master'],
  ['attendance', 'Attendance'],
  ['payroll', 'Payroll'],
  ['register', 'Salary Register'],
  ['monthly', 'Monthly Summary'],
  ['leave', 'Leave Summary'],
];

function ReportsTab() {
  const [report, setReport] = useState<ReportKey>('employees');
  const [period, setPeriod] = useState<Period>({ year: now.getFullYear(), month: now.getMonth() + 1 });

  const needsMonth = report !== 'employees' && report !== 'monthly';

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <Select className="w-full sm:w-56" value={report} onChange={(e) => setReport(e.target.value as ReportKey)}>
          {REPORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </Select>
        {needsMonth && <PeriodPicker period={period} onChange={setPeriod} />}
        {report === 'monthly' && (
          <Select className="w-28" value={String(period.year)} onChange={(e) => setPeriod({ ...period, year: Number(e.target.value) })}>
            {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        )}
      </Card>

      {report === 'employees' && <EmployeeMasterReport />}
      {(report === 'attendance' || report === 'leave') && <AttendanceLikeReport period={period} leaveOnly={report === 'leave'} />}
      {(report === 'payroll' || report === 'register') && <RegisterReport period={period} detailed={report === 'register'} />}
      {report === 'monthly' && <MonthlySummary year={period.year} />}
    </div>
  );
}

function ReportShell({ title, onExport, children, empty }: {
  title: string; onExport: () => void; children: React.ReactNode; empty: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-border p-4">
        <h3 className="text-card-title font-semibold">{title}</h3>
        <Button variant="secondary" size="sm" onClick={onExport} disabled={empty}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>
      {empty ? <p className="py-16 text-center text-body text-muted-foreground">Nothing to show for this selection.</p> : children}
    </Card>
  );
}

function EmployeeMasterReport() {
  const { data, isLoading } = useEmployeeMasterReport(true);
  const rows = data ?? [];
  if (isLoading) return <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</Card>;

  const salaryOf = (r: (typeof rows)[number]) =>
    Number(r.monthlySalary ?? r.perDaySalary ?? r.perHourSalary ?? r.shiftSalary ?? 0);

  return (
    <ReportShell
      title="Employee Master"
      empty={!rows.length}
      onExport={() => downloadCsv(
        'employee-master.csv',
        ['Employee ID', 'Code', 'Name', 'Mobile', 'Email', 'Department', 'Type', 'Status', 'Joined', 'Shift', 'Salary Type', 'Salary'],
        rows.map((r) => [r.employeeNo, r.employeeCode, r.name, r.mobile, r.email, r.department, r.employmentType, r.status, r.joiningDate.slice(0, 10), r.shift?.name, r.salaryType, salaryOf(r)]),
      )}
    >
      <Table>
        <THead><TR><TH>Employee ID</TH><TH>Name</TH><TH>Department</TH><TH>Type</TH><TH>Status</TH><TH>Joined</TH><TH>Basis</TH><TH className="text-right">Salary</TH></TR></THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.employeeNo}>
              <TD className="font-medium">{r.employeeNo}</TD>
              <TD>{r.name}</TD>
              <TD>{r.department ?? '—'}</TD>
              <TD className="text-caption">{r.employmentType.replace('_', ' ')}</TD>
              <TD><Badge variant={r.status === 'ACTIVE' ? 'success' : 'neutral'}>{r.status.replace('_', ' ')}</Badge></TD>
              <TD className="whitespace-nowrap">{format(new Date(r.joiningDate), 'dd MMM yyyy')}</TD>
              <TD className="text-caption">{SALARY_TYPE_LABEL[r.salaryType]}</TD>
              <TD className="text-right font-semibold">{formatINR(salaryOf(r))}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </ReportShell>
  );
}

function AttendanceLikeReport({ period, leaveOnly }: { period: Period; leaveOnly: boolean }) {
  const { data, isLoading } = useAttendanceReport(period, true);
  const rows = data ?? [];
  if (isLoading) return <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</Card>;

  const title = `${leaveOnly ? 'Leave Summary' : 'Attendance Report'} · ${MONTH_NAMES[period.month - 1]} ${period.year}`;

  return (
    <ReportShell
      title={title}
      empty={!rows.length}
      onExport={() => downloadCsv(
        `${leaveOnly ? 'leave' : 'attendance'}-${period.year}-${String(period.month).padStart(2, '0')}.csv`,
        leaveOnly
          ? ['Employee ID', 'Name', 'Department', 'Paid Leave', 'Unpaid Leave', 'Absent', 'Half Days']
          : ['Employee ID', 'Name', 'Department', 'Working Days', 'Present', 'Absent', 'Half', 'Paid Leave', 'Unpaid Leave', 'OT Hours', 'Payable Days'],
        rows.map((r) => leaveOnly
          ? [r.employee.employeeNo, r.employee.name, r.employee.department, Number(r.paidLeave), Number(r.unpaidLeave), Number(r.absentDays), Number(r.halfDays)]
          : [r.employee.employeeNo, r.employee.name, r.employee.department, Number(r.totalWorkingDays), Number(r.presentDays), Number(r.absentDays), Number(r.halfDays), Number(r.paidLeave), Number(r.unpaidLeave), Number(r.overtimeHours), r.payableDays]),
      )}
    >
      <Table>
        <THead>
          <TR>
            <TH>Employee</TH><TH>Department</TH>
            {leaveOnly ? (
              <><TH className="text-right">Paid leave</TH><TH className="text-right">Unpaid leave</TH><TH className="text-right">Absent</TH><TH className="text-right">Half days</TH></>
            ) : (
              <><TH className="text-right">Working</TH><TH className="text-right">Present</TH><TH className="text-right">Absent</TH><TH className="text-right">Half</TH><TH className="text-right">Paid leave</TH><TH className="text-right">Unpaid</TH><TH className="text-right">OT hrs</TH><TH className="text-right">Payable</TH></>
            )}
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD className="font-medium">{r.employee.name}<span className="ml-1.5 text-caption text-muted-foreground">{r.employee.employeeNo}</span></TD>
              <TD>{r.employee.department ?? '—'}</TD>
              {leaveOnly ? (
                <>
                  <TD className="text-right">{Number(r.paidLeave)}</TD>
                  <TD className="text-right">{Number(r.unpaidLeave)}</TD>
                  <TD className="text-right">{Number(r.absentDays)}</TD>
                  <TD className="text-right">{Number(r.halfDays)}</TD>
                </>
              ) : (
                <>
                  <TD className="text-right">{Number(r.totalWorkingDays)}</TD>
                  <TD className="text-right">{Number(r.presentDays)}</TD>
                  <TD className="text-right">{Number(r.absentDays)}</TD>
                  <TD className="text-right">{Number(r.halfDays)}</TD>
                  <TD className="text-right">{Number(r.paidLeave)}</TD>
                  <TD className="text-right">{Number(r.unpaidLeave)}</TD>
                  <TD className="text-right">{Number(r.overtimeHours)}</TD>
                  <TD className="text-right font-semibold">{r.payableDays}</TD>
                </>
              )}
            </TR>
          ))}
        </TBody>
      </Table>
    </ReportShell>
  );
}

function RegisterReport({ period, detailed }: { period: Period; detailed: boolean }) {
  const { data, isLoading } = useSalaryRegisterReport(period, true);
  const rows = data?.rows ?? [];
  if (isLoading) return <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</Card>;

  return (
    <ReportShell
      title={`${detailed ? 'Salary Register' : 'Payroll Report'} · ${MONTH_NAMES[period.month - 1]} ${period.year}`}
      empty={!rows.length}
      onExport={() => downloadCsv(
        `${detailed ? 'salary-register' : 'payroll'}-${period.year}-${String(period.month).padStart(2, '0')}.csv`,
        ['Payroll #', 'Employee ID', 'Name', 'Department', 'Basis', 'Payable Days', 'Gross', 'Allowances', 'Overtime', 'Bonus', 'Incentives', 'Deductions', 'Advance', 'Loan', 'Net', 'Status', 'Paid On'],
        rows.map((r) => [
          r.payrollNo, r.employee.employeeNo, r.employee.name, r.employee.department, r.salaryType,
          Number(r.payableDays), Number(r.grossSalary), Number(r.allowances), Number(r.overtimeAmount),
          Number(r.bonus), Number(r.incentives), Number(r.deductions), Number(r.advanceRecovery),
          Number(r.loanRecovery), Number(r.netSalary), r.status, r.paymentDate?.slice(0, 10),
        ]),
      )}
    >
      <Table>
        <THead>
          <TR>
            <TH>Payroll #</TH><TH>Employee</TH>
            {detailed && <><TH className="text-right">Allow.</TH><TH className="text-right">OT</TH><TH className="text-right">Bonus</TH><TH className="text-right">Deduct.</TH></>}
            <TH className="text-right">Gross</TH><TH className="text-right">Net</TH><TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.id}>
              <TD className="font-medium">{r.payrollNo}</TD>
              <TD>{r.employee.name}<span className="ml-1.5 text-caption text-muted-foreground">{r.employee.employeeNo}</span></TD>
              {detailed && (
                <>
                  <TD className="text-right">{formatINR(r.allowances)}</TD>
                  <TD className="text-right">{formatINR(r.overtimeAmount)}</TD>
                  <TD className="text-right">{formatINR(r.bonus)}</TD>
                  <TD className="text-right">{formatINR(Number(r.deductions) + Number(r.advanceRecovery) + Number(r.loanRecovery))}</TD>
                </>
              )}
              <TD className="text-right">{formatINR(r.grossSalary)}</TD>
              <TD className="text-right font-semibold">{formatINR(r.netSalary)}</TD>
              <TD><Badge variant={r.status === 'PAID' ? 'success' : 'warning'}>{r.status === 'PAID' ? 'Paid' : 'Pending'}</Badge></TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {data && rows.length > 0 && (
        <div className="flex justify-end gap-6 border-t border-border p-4 text-body">
          <span>Gross <span className="font-semibold">{formatINR(data.totals.gross)}</span></span>
          <span>Net <span className="font-semibold">{formatINR(data.totals.net)}</span></span>
          <span className="text-success">Paid <span className="font-semibold">{formatINR(data.totals.paid)}</span></span>
          <span className="text-danger">Pending <span className="font-semibold">{formatINR(data.totals.pending)}</span></span>
        </div>
      )}
    </ReportShell>
  );
}

function MonthlySummary({ year }: { year: number }) {
  const { data, isLoading } = useMonthlySummaryReport(year, true);
  const rows = data ?? [];
  if (isLoading) return <Card className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</Card>;

  return (
    <ReportShell
      title={`Monthly Salary Summary · ${year}`}
      empty={!rows.length}
      onExport={() => downloadCsv(
        `monthly-summary-${year}.csv`,
        ['Month', 'Employees', 'Gross', 'Overtime', 'Deductions', 'Net'],
        rows.map((r) => [r.monthName, r.employees, r.gross, r.overtime, r.deductions, r.net]),
      )}
    >
      <Table>
        <THead><TR><TH>Month</TH><TH className="text-right">Employees</TH><TH className="text-right">Gross</TH><TH className="text-right">Overtime</TH><TH className="text-right">Deductions</TH><TH className="text-right">Net</TH></TR></THead>
        <TBody>
          {rows.map((r) => (
            <TR key={r.month}>
              <TD className="font-medium">{r.monthName}</TD>
              <TD className="text-right">{r.employees}</TD>
              <TD className="text-right">{formatINR(r.gross)}</TD>
              <TD className="text-right">{formatINR(r.overtime)}</TD>
              <TD className="text-right">{formatINR(r.deductions)}</TD>
              <TD className="text-right font-semibold">{formatINR(r.net)}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </ReportShell>
  );
}
