'use client';

import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import {
  Users, Wallet, FileText, Play, Check, Undo2,
  Download, Pencil, HandCoins, Plus, Trash2,
  CheckCircle2, XCircle, Clock, CalendarDays, Hourglass, BadgeIndianRupee,
  CalendarCheck, Calculator, ClipboardList, Receipt, CreditCard, BarChart3, Settings as SettingsIcon,
  TrendingUp, TrendingDown, MoreVertical, Search, SlidersHorizontal, ChevronRight,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR, ist, istDateInput, todayIso } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import { useEmployees, activeSalary, SALARY_TYPE_LABEL, type Employee } from '@/hooks/useEmployees';
import {
  useAttendance, useSaveAttendance, usePayroll, useGeneratePayroll, useUpdatePayroll,
  useMarkPayrollPaid, useRevertPayroll, usePayrollDashboard, openPayslip, downloadCsv,
  useEmployeeMasterReport, useAttendanceReport, useSalaryRegisterReport, useMonthlySummaryReport,
  useAdvances, useCreateAdvance, useUpdateAdvance, useDeleteAdvance,
  MONTH_NAMES, type AttendanceRow, type PayrollRow, type Period, type AdvanceRow, type AdvancePaymentMethod,
} from '@/hooks/usePayroll';

// Dashboard, Attendance and Salary used to be three separate tabs — checking the
// month's numbers, then entering attendance, then processing salary meant clicking
// across all three for one task. They're now one scrolling "Payroll" screen sharing
// a single period picker, so that whole workflow needs zero tab-switching; Advances
// and Reports stay separate since they aren't part of that same month-by-month flow.
type Tab = 'payroll' | 'advances' | 'reports';

const TABS: Array<[Tab, string, typeof Users]> = [
  ['payroll', 'Payroll', Wallet],
  ['advances', 'Advances', HandCoins],
  ['reports', 'Reports', FileText],
];

const now = ist();
const today = () => todayIso();

export default function PayrollPage() {
  const [tab, setTab] = useState<Tab>('payroll');
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
        {tab === 'payroll' && <PeriodPicker period={period} onChange={setPeriod} />}
      </div>

      {tab === 'payroll' && <PayrollTab period={period} onSwitchTab={setTab} />}
      {tab === 'advances' && <AdvancesTab />}
      {tab === 'reports' && <ReportsTab />}
    </div>
  );
}

/** Dashboard + Attendance + Salary, merged into one screen instead of three
 *  separate tables behind three tabs — the KPI strip, quick-action shortcuts,
 *  one combined per-employee table (attendance + pay side by side), and the
 *  running totals are all visible without a single click to get to any of
 *  them. Quick actions that only make sense for one employee at a time (mark
 *  attendance, view a payslip, record a payment) scroll down to that row's own
 *  action menu rather than guessing which employee was meant. */
function PayrollTab({ period, onSwitchTab }: { period: Period; onSwitchTab: (t: Tab) => void }) {
  const overviewRef = useRef<HTMLDivElement>(null);
  const scrollToOverview = () => overviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="space-y-5">
      <PayrollKpiStrip period={period} />
      <QuickActionGrid onScrollToOverview={scrollToOverview} onSwitchTab={onSwitchTab} />
      <EmployeePayrollOverview ref={overviewRef} period={period} onSwitchTab={onSwitchTab} />
    </div>
  );
}

const KPI_ICON_BG: Record<string, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
};

/** One compact stat tile — smaller and denser than the full KpiCard, so eight
 *  of them read as one strip instead of eight separate dashboard cards. */
function StatTile({ label, value, icon: Icon, accent = 'primary' }: {
  label: string; value: string; icon: typeof Users; accent?: 'primary' | 'success' | 'warning' | 'danger';
}) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', KPI_ICON_BG[accent])}>
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-caption text-muted-foreground">{label}</span>
        <span className="block text-label font-bold leading-tight">{value}</span>
      </span>
    </Card>
  );
}

/** The whole month at a glance: headcount + today's-entered attendance mix on
 *  the left, this month's payroll money on the right — eight tiles, one glance. */
function PayrollKpiStrip({ period }: { period: Period }) {
  const { data: dash, isLoading: dashLoading } = usePayrollDashboard(period);
  const { data: payroll, isLoading: payrollLoading } = usePayroll(period);

  if (dashLoading || payrollLoading || !dash) {
    return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[68px]" />)}</div>;
  }

  const a = dash.attendance;
  const totals = payroll?.totals;
  const leave = a.paidLeave + a.unpaidLeave;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      <StatTile label="Total Employees" value={String(dash.totalEmployees)} icon={Users} accent="primary" />
      <StatTile label="Present" value={String(a.presentDays)} icon={CheckCircle2} accent="success" />
      <StatTile label="Absent" value={String(a.absentDays)} icon={XCircle} accent="danger" />
      <StatTile label="Half Day" value={String(a.halfDays)} icon={Clock} accent="warning" />
      <StatTile label="Leave" value={String(leave)} icon={CalendarDays} accent="primary" />
      <StatTile label="Total Salary" value={formatINR(totals?.net ?? 0, { decimals: false })} icon={Wallet} accent="primary" />
      <StatTile label="Paid" value={formatINR(totals?.paid ?? 0, { decimals: false })} icon={BadgeIndianRupee} accent="success" />
      <StatTile label="Pending" value={formatINR(totals?.pending ?? 0, { decimals: false })} icon={Hourglass} accent={totals && totals.pending > 0 ? 'warning' : 'primary'} />
    </div>
  );
}

interface QuickAction { label: string; sub: string; icon: typeof Users; accent: keyof typeof KPI_ICON_BG; onClick?: () => void; href?: string }

/** Nine shortcuts to the parts of this page (or the app) each thing actually
 *  lives in. Employees and Salary setup live under Item Master, not here — see
 *  employees-tab.tsx — so those two are real links; everything else that's
 *  per-employee (attendance, payslip, payment) scrolls to the table below,
 *  where every row's own action menu has it, rather than guessing which
 *  employee "Mark Attendance" as a bare button would mean. */
function QuickActionGrid({ onScrollToOverview, onSwitchTab }: { onScrollToOverview: () => void; onSwitchTab: (t: Tab) => void }) {
  const actions: QuickAction[] = [
    { label: 'Employees', sub: 'Add / View / Edit', icon: Users, accent: 'primary', href: '/item-master?tab=employees' },
    { label: 'Attendance', sub: 'Mark / View', icon: CalendarCheck, accent: 'success', onClick: onScrollToOverview },
    { label: 'Salary', sub: 'Setup Salary', icon: Calculator, accent: 'primary', href: '/item-master?tab=employees' },
    { label: 'Payroll', sub: 'Process Payroll', icon: ClipboardList, accent: 'primary', onClick: onScrollToOverview },
    { label: 'Payslip', sub: 'View / Print', icon: Receipt, accent: 'danger', onClick: onScrollToOverview },
    { label: 'Payment', sub: 'Pay / View', icon: CreditCard, accent: 'success', onClick: onScrollToOverview },
    { label: 'Advance', sub: 'Add / View', icon: HandCoins, accent: 'warning', onClick: () => onSwitchTab('advances') },
    { label: 'Reports', sub: 'All Reports', icon: BarChart3, accent: 'primary', onClick: () => onSwitchTab('reports') },
    { label: 'Settings', sub: 'Preferences', icon: SettingsIcon, accent: 'primary', href: '/settings' },
  ];

  return (
    <Card className="p-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {actions.map((a) => {
          const body = (
            <>
              <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', KPI_ICON_BG[a.accent])}>
                <a.icon className="h-5 w-5" />
              </span>
              <span className="text-center text-caption font-semibold leading-tight">{a.label}</span>
              <span className="text-center text-[11px] leading-tight text-muted-foreground">{a.sub}</span>
            </>
          );
          const className = 'flex flex-col items-center gap-1.5 rounded-lg p-2 text-center transition-colors hover:bg-surface active:scale-[0.98]';
          return a.href ? (
            <Link key={a.label} href={a.href} className={className}>{body}</Link>
          ) : (
            <button key={a.label} type="button" onClick={a.onClick} className={className}>{body}</button>
          );
        })}
      </div>
    </Card>
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

/** Standard 30-day payroll month — the flat divisor most shops run salary on,
 * regardless of how many calendar days a given month actually has. */
const DEFAULT_WORKING_DAYS = 30;

function AttendanceDialog({ target, period, onClose }: {
  target: { employeeId: string; name: string; existing?: AttendanceRow } | null;
  period: Period;
  onClose: () => void;
}) {
  const save = useSaveAttendance();
  const [form, setForm] = useState({
    totalWorkingDays: DEFAULT_WORKING_DAYS, presentDays: 0, absentDays: 0, halfDays: 0,
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
            totalWorkingDays: DEFAULT_WORKING_DAYS,
            presentDays: 0, absentDays: 0, halfDays: 0, paidLeave: 0, unpaidLeave: 0,
            overtimeHours: 0, workingHours: 0, notes: '',
          },
    );
  }, [target]);

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

// ───────────────────── Employee Payroll Overview ─────────────────────────────
const PAGE_SIZE = 5;
type PayrollStatusFilter = 'ALL' | 'PAID' | 'PENDING' | 'NOT_PROCESSED';

interface OverviewRow {
  employee: Employee;
  attendance?: AttendanceRow;
  payroll?: PayrollRow;
}

/** Present/Absent/etc. come from attendance (null until entered); Basic/
 *  Earnings/Deductions/Net come from the generated payroll row once there is
 *  one — before that, Basic falls back to the employee's own configured rate
 *  (activeSalary) so the column isn't just blank for a month nobody's run
 *  Process Payroll on yet, and Net matches Basic since nothing's been added
 *  or taken off it. */
function figuresFor(r: OverviewRow) {
  const { attendance: a, payroll: p, employee } = r;
  const basic = p ? Number(p.grossSalary) : activeSalary(employee).amount;
  const earnings = p ? Number(p.allowances) + Number(p.overtimeAmount) + Number(p.bonus) + Number(p.incentives) : 0;
  const deductions = p ? Number(p.deductions) + Number(p.advanceRecovery) + Number(p.loanRecovery) : 0;
  const net = p ? Number(p.netSalary) : basic;
  const statusLabel = !p ? 'Not Processed' : p.status === 'PAID' ? 'Paid' : 'Pending';
  const badgeVariant: BadgeProps['variant'] = !p ? 'neutral' : p.status === 'PAID' ? 'success' : 'warning';
  return {
    present: a ? Number(a.presentDays) : null,
    absent: a ? Number(a.absentDays) : null,
    halfDay: a ? Number(a.halfDays) : null,
    leave: a ? Number(a.paidLeave) + Number(a.unpaidLeave) : null,
    otHours: a ? Number(a.overtimeHours) : null,
    basic, earnings, deductions, net, statusLabel, badgeVariant,
  };
}

function statusOf(r: OverviewRow): PayrollStatusFilter {
  return !r.payroll ? 'NOT_PROCESSED' : r.payroll.status === 'PAID' ? 'PAID' : 'PENDING';
}

/** One combined row per employee — attendance and pay side by side — instead
 *  of two separate tables you had to cross-reference by name. Search, a
 *  status filter, CSV export, and pagination (five at a time, matching a
 *  quick glance rather than one long scroll), plus a single action menu per
 *  row instead of a strip of icon buttons competing for space. */
const EmployeePayrollOverview = forwardRef<HTMLDivElement, { period: Period; onSwitchTab: (t: Tab) => void }>(
  function EmployeePayrollOverview({ period, onSwitchTab }, ref) {
    const { data: employees, isLoading: employeesLoading } = useEmployees({ status: 'ACTIVE' });
    const { data: attendance, isLoading: attendanceLoading } = useAttendance(period);
    const { data: payroll, isLoading: payrollLoading } = usePayroll(period);
    const generate = useGeneratePayroll();
    const markPaid = useMarkPayrollPaid();
    const revert = useRevertPayroll();
    const [editingAttendance, setEditingAttendance] = useState<{ employeeId: string; name: string; existing?: AttendanceRow } | null>(null);
    const [adjusting, setAdjusting] = useState<PayrollRow | null>(null);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<PayrollStatusFilter>('ALL');
    const [showFilter, setShowFilter] = useState(false);
    const [page, setPage] = useState(1);

    const attendanceByEmployee = useMemo(() => new Map((attendance ?? []).map((a) => [a.employeeId, a])), [attendance]);
    const payrollByEmployee = useMemo(() => new Map((payroll?.rows ?? []).map((p) => [p.employeeId, p])), [payroll]);

    const allRows: OverviewRow[] = useMemo(
      () => (employees ?? []).map((e) => ({ employee: e, attendance: attendanceByEmployee.get(e.id), payroll: payrollByEmployee.get(e.id) })),
      [employees, attendanceByEmployee, payrollByEmployee],
    );

    const filtered = useMemo(() => {
      const q = search.trim().toLowerCase();
      return allRows.filter((r) => {
        if (statusFilter !== 'ALL' && statusOf(r) !== statusFilter) return false;
        if (!q) return true;
        return r.employee.name.toLowerCase().includes(q) || r.employee.employeeNo.toLowerCase().includes(q);
      });
    }, [allRows, search, statusFilter]);

    useEffect(() => { setPage(1); }, [search, statusFilter, period.year, period.month]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const isLoading = employeesLoading || attendanceLoading || payrollLoading;

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

    const exportCsv = () => downloadCsv(
      `payroll-overview-${period.year}-${String(period.month).padStart(2, '0')}.csv`,
      ['Employee ID', 'Name', 'Present', 'Absent', 'Half Day', 'Leave', 'OT Hours', 'Basic Salary', 'Earnings', 'Deductions', 'Net Salary', 'Status'],
      filtered.map((r) => {
        const f = figuresFor(r);
        return [r.employee.employeeNo, r.employee.name, f.present, f.absent, f.halfDay, f.leave, f.otHours, f.basic, f.earnings, f.deductions, f.net, f.statusLabel];
      }),
    );

    const nudgeToRow = () => toast('Pick an employee\'s ⋮ menu below to do this for them.', { icon: 'ℹ️' });

    return (
      <div ref={ref} className="space-y-4">
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-card-title font-semibold">Employee Payroll Overview</h2>
            <p className="text-caption text-muted-foreground">
              {MONTH_NAMES[period.month - 1]} {period.year} — attendance and salary, side by side. Uses each employee&apos;s salary
              structure and this month&apos;s attendance; already-paid rows are never restated.
            </p>
          </div>
          <Button onClick={runGenerate} loading={generate.isPending}><Play className="h-4 w-4" /> Process Payroll</Button>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search Employee…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Button variant="secondary" size="sm" onClick={() => setShowFilter((v) => !v)}>
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Filter
                </Button>
                {showFilter && (
                  <div className="absolute right-0 z-20 mt-1 w-48 space-y-1.5 rounded-md border border-border bg-card p-3 shadow-lg">
                    <Label>Payment status</Label>
                    <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PayrollStatusFilter)}>
                      <option value="ALL">All</option>
                      <option value="NOT_PROCESSED">Not Processed</option>
                      <option value="PENDING">Pending</option>
                      <option value="PAID">Paid</option>
                    </Select>
                  </div>
                )}
              </div>
              <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!filtered.length}>
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : !allRows.length ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Users className="h-8 w-8 text-muted-foreground" />
              <p className="text-body text-muted-foreground">No active employees. Add them under Employees first.</p>
            </div>
          ) : !filtered.length ? (
            <p className="py-16 text-center text-body text-muted-foreground">No employee matches this search or filter.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>#</TH><TH>Employee Name</TH>
                      <TH className="text-right">Present</TH><TH className="text-right">Absent</TH>
                      <TH className="text-right">Half Day</TH><TH className="text-right">Leave</TH>
                      <TH className="text-right">OT Hours</TH><TH className="text-right">Basic Salary</TH>
                      <TH className="text-right">Earnings</TH><TH className="text-right">Deductions</TH>
                      <TH className="text-right">Net Salary</TH><TH>Payment Status</TH><TH className="text-right">Action</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {pageRows.map((r, i) => {
                      const f = figuresFor(r);
                      const menuItems = [
                        {
                          label: r.attendance ? 'Edit Attendance' : 'Mark Attendance', icon: CalendarCheck,
                          onClick: () => setEditingAttendance({ employeeId: r.employee.id, name: r.employee.name, existing: r.attendance }),
                        },
                        ...(r.payroll
                          ? [
                              { label: 'View Payslip', icon: Download, onClick: () => openPayslip(r.payroll!.id, r.payroll!.payrollNo).catch((e) => toast.error(apiErrorMessage(e))) },
                              ...(r.payroll.status !== 'PAID'
                                ? [
                                    { label: 'Adjust Bonus / Deductions', icon: Pencil, onClick: () => setAdjusting(r.payroll!) },
                                    { label: 'Mark as Paid', icon: Check, onClick: () => pay(r.payroll!) },
                                  ]
                                : [{ label: 'Undo Payment', icon: Undo2, danger: true, onClick: () => undo(r.payroll!) }]),
                            ]
                          : []),
                      ];
                      return (
                        <TR key={r.employee.id}>
                          <TD className="text-caption text-muted-foreground">{(page - 1) * PAGE_SIZE + i + 1}</TD>
                          <TD>
                            <span className="block font-medium">{r.employee.name}</span>
                            <span className="block text-caption text-muted-foreground">{r.employee.department ?? SALARY_TYPE_LABEL[r.employee.salaryType]}</span>
                          </TD>
                          <TD className="text-right">{f.present ?? '—'}</TD>
                          <TD className="text-right">{f.absent ?? '—'}</TD>
                          <TD className="text-right">{f.halfDay ?? '—'}</TD>
                          <TD className="text-right">{f.leave ?? '—'}</TD>
                          <TD className="text-right">{f.otHours ?? '—'}</TD>
                          <TD className="text-right">{formatINR(f.basic)}</TD>
                          <TD className="text-right text-success">{f.earnings > 0 ? `+${formatINR(f.earnings)}` : '—'}</TD>
                          <TD className="text-right text-danger">{f.deductions > 0 ? `-${formatINR(f.deductions)}` : '—'}</TD>
                          <TD className="text-right font-semibold">{formatINR(f.net)}</TD>
                          <TD><Badge variant={f.badgeVariant}>{f.statusLabel}</Badge></TD>
                          <TD className="text-right"><RowMenu items={menuItems} /></TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </div>

              <div className="flex flex-col gap-2 border-t border-border p-4 text-caption text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} employees</span>
                <div className="flex items-center gap-1">
                  <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <Button key={i} size="sm" variant={page === i + 1 ? 'primary' : 'ghost'} onClick={() => setPage(i + 1)}>{i + 1}</Button>
                  ))}
                  <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>

        <PayrollSummaryStrip rows={payroll?.rows ?? []} totals={payroll?.totals} />

        <Card className="p-3">
          <p className="mb-2 px-1 text-caption font-semibold uppercase tracking-wide text-muted-foreground">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Button variant="secondary" className="justify-start" onClick={nudgeToRow}><CalendarCheck className="h-4 w-4" /> Mark Attendance</Button>
            <Button variant="secondary" className="justify-start" loading={generate.isPending} onClick={runGenerate}><Play className="h-4 w-4" /> Process Payroll</Button>
            <Button variant="secondary" className="justify-start" onClick={nudgeToRow}><Receipt className="h-4 w-4" /> Generate Payslip</Button>
            <Button variant="secondary" className="justify-start" onClick={nudgeToRow}><CreditCard className="h-4 w-4" /> Record Payment</Button>
            <Button variant="secondary" className="justify-start" onClick={() => onSwitchTab('reports')}><BarChart3 className="h-4 w-4" /> View Reports</Button>
          </div>
        </Card>

        <AttendanceDialog target={editingAttendance} period={period} onClose={() => setEditingAttendance(null)} />
        <AdjustDialog row={adjusting} onClose={() => setAdjusting(null)} />
      </div>
    );
  },
);

function PayrollSummaryStrip({ rows, totals }: { rows: PayrollRow[]; totals?: { gross: number; net: number; paid: number; pending: number } }) {
  const totalEarnings = rows.reduce((s, r) => s + Number(r.allowances) + Number(r.overtimeAmount) + Number(r.bonus) + Number(r.incentives), 0);
  const totalDeductions = rows.reduce((s, r) => s + Number(r.deductions) + Number(r.advanceRecovery) + Number(r.loanRecovery), 0);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatTile label="Total Earnings" value={formatINR(totalEarnings, { decimals: false })} icon={TrendingUp} accent="success" />
      <StatTile label="Total Deductions" value={formatINR(totalDeductions, { decimals: false })} icon={TrendingDown} accent="danger" />
      <StatTile label="Net Payable" value={formatINR(totals?.net ?? 0, { decimals: false })} icon={Wallet} accent="primary" />
      <StatTile label="Paid Amount" value={formatINR(totals?.paid ?? 0, { decimals: false })} icon={BadgeIndianRupee} accent="success" />
      <StatTile label="Pending Amount" value={formatINR(totals?.pending ?? 0, { decimals: false })} icon={Hourglass} accent={totals && totals.pending > 0 ? 'warning' : 'primary'} />
    </div>
  );
}

interface RowMenuItem { label: string; icon: typeof Users; onClick: () => void; danger?: boolean }

/** One action menu per row instead of a strip of icon buttons competing for
 *  space — matches the image's single "⋮" Action column, and scales to
 *  however many actions a given row actually has (a not-yet-processed
 *  employee only gets "Mark Attendance"; a paid one gets payslip + undo). */
function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Portaled to <body> rather than positioned relative to the button: the
  // table around it scrolls horizontally (overflow-x-auto), which — per the
  // CSS spec — quietly turns overflow-y auto too, clipping an absolutely
  // positioned menu that tried to live inside it. Fixed-position + measuring
  // the button's own rect sidesteps that entirely.
  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <>
      <Button ref={triggerRef} variant="ghost" size="icon" onClick={() => (open ? setOpen(false) : openMenu())}>
        <MoreVertical className="h-4 w-4" />
      </Button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, right: coords.right }}
          className="z-50 w-56 rounded-md border border-border bg-card py-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => { setOpen(false); item.onClick(); }}
              className={cn('flex w-full items-center gap-2 px-3 py-2 text-left text-body hover:bg-surface', item.danger && 'text-danger')}
            >
              <item.icon className="h-4 w-4" /> {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

function AdjustDialog({ row, onClose }: { row: PayrollRow | null; onClose: () => void }) {
  const update = useUpdatePayroll();
  const [form, setForm] = useState({ allowances: 0, deductions: 0, bonus: 0, incentives: 0, advanceRecovery: 0, loanRecovery: 0 });
  const set = <K extends keyof typeof form>(k: K, v: number) => setForm((f) => ({ ...f, [k]: v }));
  // What this employee still owes right now — Generate Salary already pre-filled
  // advanceRecovery with this figure for a brand-new row, this is just so the admin
  // can see the number they're looking at actually means something before saving.
  const { data: advances } = useAdvances({ employeeId: row?.employee.id, status: 'OUTSTANDING' }, !!row);
  const outstanding = advances?.outstandingTotal ?? 0;

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
          <div>
            <Num label="Advance recovery (₹)" value={form.advanceRecovery} onChange={(v) => set('advanceRecovery', v)} step={0.01} />
            {outstanding > 0 && (
              <p className="mt-1 text-caption text-muted-foreground">{row.employee.name} owes {formatINR(outstanding)} in advances.</p>
            )}
          </div>
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

// ───────────────────────────── Advances ──────────────────────────────────────
const ADVANCE_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'NET_BANKING'] as const;
const ADVANCE_METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash', UPI: 'UPI', BANK_TRANSFER: 'Bank Transfer', CARD: 'Card', NET_BANKING: 'Net Banking', RAZORPAY: 'Razorpay',
};

function AdvancesTab() {
  const { data, isLoading } = useAdvances();
  const del = useDeleteAdvance();
  const [editing, setEditing] = useState<AdvanceRow | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = data?.rows ?? [];

  const remove = (a: AdvanceRow) => {
    if (!window.confirm(`Delete the ${formatINR(a.amount)} advance given to ${a.employee.name}? The booked expense will be removed too.`)) return;
    del.mutate(a.id, {
      onSuccess: () => toast.success('Advance deleted'),
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-body">Cash given to staff ahead of payday, recovered from a later salary.</p>
          <p className="text-caption text-muted-foreground">
            {data ? `${formatINR(data.outstandingTotal)} outstanding across ${rows.filter((r) => r.status === 'OUTSTANDING').length} advance(s)` : ' '}
          </p>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Give Advance</Button>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <HandCoins className="h-8 w-8 text-muted-foreground" />
            <p className="text-body text-muted-foreground">No advances given yet.</p>
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Advance #</TH><TH>Employee</TH><TH>Given</TH><TH>Method</TH>
                <TH className="text-right">Amount</TH><TH className="text-right">Recovered</TH>
                <TH className="text-right">Outstanding</TH><TH>Status</TH><TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((a) => {
                const outstanding = Number(a.amount) - Number(a.amountRecovered);
                const editable = Number(a.amountRecovered) === 0;
                return (
                  <TR key={a.id}>
                    <TD className="font-medium">{a.advanceNo}</TD>
                    <TD>{a.employee.name}<span className="ml-1.5 text-caption text-muted-foreground">{a.employee.employeeNo}</span></TD>
                    <TD className="whitespace-nowrap">{format(ist(a.givenDate), 'dd MMM yyyy')}</TD>
                    <TD className="text-caption">{ADVANCE_METHOD_LABEL[a.paymentMethod] ?? a.paymentMethod}</TD>
                    <TD className="text-right">{formatINR(a.amount)}</TD>
                    <TD className="text-right text-muted-foreground">{formatINR(a.amountRecovered)}</TD>
                    <TD className={cn('text-right font-semibold', outstanding > 0 && 'text-danger')}>{formatINR(outstanding)}</TD>
                    <TD><Badge variant={a.status === 'OUTSTANDING' ? 'warning' : 'success'}>{a.status === 'OUTSTANDING' ? 'Outstanding' : 'Recovered'}</Badge></TD>
                    <TD>
                      {editable && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditing(a)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => remove(a)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                        </div>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <AdvanceFormDialog open={creating || !!editing} onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }} advance={editing} />
    </div>
  );
}

function AdvanceFormDialog({ open, onOpenChange, advance }: {
  open: boolean; onOpenChange: (v: boolean) => void; advance: AdvanceRow | null;
}) {
  const { data: employees } = useEmployees({ status: 'ACTIVE' });
  const create = useCreateAdvance();
  const update = useUpdateAdvance();
  const [form, setForm] = useState({
    employeeId: '', amount: 0, givenDate: today(), paymentMethod: 'CASH' as AdvancePaymentMethod, notes: '',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setForm(
      advance
        ? { employeeId: advance.employeeId, amount: Number(advance.amount), givenDate: istDateInput(advance.givenDate), paymentMethod: advance.paymentMethod, notes: advance.notes ?? '' }
        : { employeeId: employees?.[0]?.id ?? '', amount: 0, givenDate: today(), paymentMethod: 'CASH', notes: '' },
    );
    // employees only seeds the default for a brand-new advance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, advance]);

  const submit = () => {
    if (!form.employeeId) { toast.error('Pick an employee'); return; }
    if (form.amount <= 0) { toast.error('Enter an amount greater than zero'); return; }
    const payload = { amount: form.amount, givenDate: form.givenDate, paymentMethod: form.paymentMethod, notes: form.notes.trim() || undefined };
    const onSettled = {
      onSuccess: () => { toast.success(advance ? 'Advance updated' : 'Advance recorded'); onOpenChange(false); },
      onError: (e: unknown) => toast.error(apiErrorMessage(e)),
    };
    if (advance) update.mutate({ id: advance.id, ...payload }, onSettled);
    else create.mutate({ employeeId: form.employeeId, ...payload }, onSettled);
  };

  const saving = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{advance ? `Edit ${advance.advanceNo}` : 'Give Advance'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Employee</Label>
            <Select value={form.employeeId} onChange={(e) => set('employeeId', e.target.value)} disabled={!!advance}>
              {!employees?.length && <option value="">No active employees</option>}
              {(employees ?? []).map((e) => <option key={e.id} value={e.id}>{e.name} ({e.employeeNo})</option>)}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount (₹)</Label>
            <Input type="number" step="0.01" min={0} value={form.amount} onChange={(e) => set('amount', Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Given on</Label>
            <Input type="date" value={form.givenDate} onChange={(e) => set('givenDate', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Select value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value as AdvancePaymentMethod)}>
              {ADVANCE_METHODS.map((m) => <option key={m} value={m}>{ADVANCE_METHOD_LABEL[m]}</option>)}
            </Select>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{advance ? 'Save' : 'Give Advance'}</Button>
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
        rows.map((r) => [r.employeeNo, r.employeeCode, r.name, r.mobile, r.email, r.department, r.employmentType, r.status, istDateInput(r.joiningDate), r.shift?.name, r.salaryType, salaryOf(r)]),
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
              <TD className="whitespace-nowrap">{format(ist(r.joiningDate), 'dd MMM yyyy')}</TD>
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
          Number(r.loanRecovery), Number(r.netSalary), r.status, istDateInput(r.paymentDate),
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
