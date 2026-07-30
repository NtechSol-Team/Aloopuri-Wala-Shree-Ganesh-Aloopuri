'use client';

import { useDeferredValue, useEffect, useState } from 'react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Search, Users, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { cn, formatINR } from '@/lib/utils';
import { apiErrorMessage } from '@/lib/api';
import {
  useEmployees, useSaveEmployee, useDeleteEmployee,
  useShifts, useSaveShift, useDeleteShift,
  activeSalary,
  EMPLOYMENT_TYPE_LABEL, EMPLOYEE_STATUS_LABEL, EMPLOYEE_STATUS_BADGE, SALARY_TYPE_LABEL,
  type Employee, type EmployeeStatus, type EmploymentType, type Gender, type SalaryType, type Shift,
} from '@/hooks/useEmployees';

type Tab = 'employees' | 'shifts';

const TABS: Array<[Tab, string]> = [
  ['employees', 'Employees'],
  ['shifts', 'Shifts'],
];

const today = () => new Date().toISOString().slice(0, 10);

export default function EmployeesPage() {
  const [tab, setTab] = useState<Tab>('employees');

  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b border-border">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'border-b-2 px-4 py-2 text-body font-medium transition-colors',
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'employees' && <EmployeesTab />}
      {tab === 'shifts' && <ShiftsTab />}
    </div>
  );
}

// ─────────────────────────────── Employees ──────────────────────────────────
function EmployeesTab() {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState<EmployeeStatus | ''>('');
  const { data, isLoading } = useEmployees({ search: deferredSearch || undefined, status: status || undefined });
  const [editing, setEditing] = useState<Employee | null>(null);
  const [creating, setCreating] = useState(false);
  const del = useDeleteEmployee();

  const rows = data ?? [];

  const remove = (e: Employee) => {
    if (!window.confirm(`Remove ${e.name} (${e.employeeNo})?`)) return;
    del.mutate(e.id, {
      onSuccess: () => toast.success('Employee removed'),
      onError: (err) => toast.error(apiErrorMessage(err)),
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name, ID or mobile..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select className="w-full sm:w-44" value={status} onChange={(e) => setStatus(e.target.value as EmployeeStatus | '')}>
            <option value="">All statuses</option>
            {(Object.keys(EMPLOYEE_STATUS_LABEL) as EmployeeStatus[]).map((s) => (
              <option key={s} value={s}>{EMPLOYEE_STATUS_LABEL[s]}</option>
            ))}
          </Select>
        </div>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add Employee</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !rows.length ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="text-body text-muted-foreground">No employees yet.</p>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add first employee</Button>
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Employee ID</TH><TH>Name</TH><TH>Department</TH><TH>Type</TH>
              <TH>Shift</TH><TH className="text-right">Salary</TH><TH>Joined</TH><TH>Status</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((e) => {
              const pay = activeSalary(e);
              return (
                <TR key={e.id}>
                  <TD className="font-medium">
                    {e.employeeNo}
                    {e.employeeCode && <span className="ml-1.5 text-caption text-muted-foreground">{e.employeeCode}</span>}
                  </TD>
                  <TD>
                    {e.name}
                    {e.mobile && <span className="ml-1.5 text-caption text-muted-foreground">{e.mobile}</span>}
                  </TD>
                  <TD>{e.department ?? <span className="text-muted-foreground">—</span>}</TD>
                  <TD className="text-caption">{EMPLOYMENT_TYPE_LABEL[e.employmentType]}</TD>
                  <TD className="text-caption">{e.shift ? `${e.shift.name} (${e.shift.startTime}–${e.shift.endTime})` : <span className="text-muted-foreground">—</span>}</TD>
                  <TD className="text-right">
                    <span className="font-semibold">{formatINR(pay.amount)}</span>
                    <span className="ml-1 text-caption text-muted-foreground">{pay.label}</span>
                  </TD>
                  <TD className="whitespace-nowrap">{format(new Date(e.joiningDate), 'dd MMM yyyy')}</TD>
                  <TD><Badge variant={EMPLOYEE_STATUS_BADGE[e.status]}>{EMPLOYEE_STATUS_LABEL[e.status]}</Badge></TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditing(e)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Remove" onClick={() => remove(e)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                    </div>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}

      <EmployeeFormDialog
        open={creating || !!editing}
        onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }}
        employee={editing}
      />
    </Card>
  );
}

const emptyEmployee = {
  employeeCode: '', name: '', mobile: '', email: '', dateOfBirth: '', gender: '' as Gender | '',
  address: '', joiningDate: today(),
  employmentType: 'FULL_TIME' as EmploymentType, status: 'ACTIVE' as EmployeeStatus,
  department: '', shiftId: '',
  salaryType: 'MONTHLY' as SalaryType,
  monthlySalary: 0, basicSalary: 0, allowances: 0, deductions: 0, overtimeRate: 0,
  perDaySalary: 0, perHourSalary: 0,
  shiftSalaryName: '', shiftDurationHours: 0, shiftSalary: 0,
};

function EmployeeFormDialog({ open, onOpenChange, employee }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employee: Employee | null;
}) {
  const save = useSaveEmployee();
  const { data: shifts } = useShifts();
  const [form, setForm] = useState({ ...emptyEmployee });
  const set = <K extends keyof typeof emptyEmployee>(k: K, v: (typeof emptyEmployee)[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setForm(
      employee
        ? {
            employeeCode: employee.employeeCode ?? '',
            name: employee.name,
            mobile: employee.mobile ?? '',
            email: employee.email ?? '',
            dateOfBirth: employee.dateOfBirth ? employee.dateOfBirth.slice(0, 10) : '',
            gender: employee.gender ?? '',
            address: employee.address ?? '',
            joiningDate: employee.joiningDate.slice(0, 10),
            employmentType: employee.employmentType,
            status: employee.status,
            department: employee.department ?? '',
            shiftId: employee.shiftId ?? '',
            salaryType: employee.salaryType,
            monthlySalary: Number(employee.monthlySalary ?? 0),
            basicSalary: Number(employee.basicSalary ?? 0),
            allowances: Number(employee.allowances ?? 0),
            deductions: Number(employee.deductions ?? 0),
            overtimeRate: Number(employee.overtimeRate ?? 0),
            perDaySalary: Number(employee.perDaySalary ?? 0),
            perHourSalary: Number(employee.perHourSalary ?? 0),
            shiftSalaryName: employee.shiftSalaryName ?? '',
            shiftDurationHours: Number(employee.shiftDurationHours ?? 0),
            shiftSalary: Number(employee.shiftSalary ?? 0),
          }
        : { ...emptyEmployee },
    );
  }, [open, employee]);

  const submit = () => {
    if (form.name.trim().length < 2) { toast.error('Enter the employee name'); return; }
    // Only the chosen structure's figures are sent; the server clears the rest.
    const salary =
      form.salaryType === 'MONTHLY'
        ? { monthlySalary: form.monthlySalary, basicSalary: form.basicSalary, allowances: form.allowances, deductions: form.deductions, overtimeRate: form.overtimeRate }
        : form.salaryType === 'DAILY'
          ? { perDaySalary: form.perDaySalary }
          : form.salaryType === 'HOURLY'
            ? { perHourSalary: form.perHourSalary }
            : { shiftSalaryName: form.shiftSalaryName.trim() || undefined, shiftDurationHours: form.shiftDurationHours, shiftSalary: form.shiftSalary };

    save.mutate(
      {
        id: employee?.id,
        employeeCode: form.employeeCode.trim() || undefined,
        name: form.name.trim(),
        mobile: form.mobile.trim() || undefined,
        email: form.email.trim() || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        address: form.address.trim() || undefined,
        joiningDate: form.joiningDate,
        employmentType: form.employmentType,
        status: form.status,
        department: form.department.trim() || undefined,
        shiftId: form.shiftId || null,
        salaryType: form.salaryType,
        ...salary,
      },
      {
        onSuccess: () => { toast.success(employee ? 'Employee updated' : 'Employee added'); onOpenChange(false); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{employee ? `Edit ${employee.employeeNo}` : 'Add Employee'}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1 scrollbar-thin">
          <section className="space-y-3">
            <h4 className="text-label font-semibold">Basic information</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Employee code <span className="text-muted-foreground">(optional)</span></Label>
                <Input placeholder="Your own code" value={form.employeeCode} onChange={(e) => set('employeeCode', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Mobile</Label>
                <Input value={form.mobile} onChange={(e) => set('mobile', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Date of birth</Label>
                <Input type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={form.gender} onChange={(e) => set('gender', e.target.value as Gender | '')}>
                  <option value="">Not specified</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                  <option value="OTHER">Other</option>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Address</Label>
                <textarea
                  className="min-h-[60px] w-full rounded-md border border-border bg-card px-3 py-2 text-body outline-none focus:border-primary"
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-label font-semibold">Employment</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Joining date</Label>
                <Input type="date" value={form.joiningDate} onChange={(e) => set('joiningDate', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Department</Label>
                <Input placeholder="e.g. Production" value={form.department} onChange={(e) => set('department', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Employment type</Label>
                <Select value={form.employmentType} onChange={(e) => set('employmentType', e.target.value as EmploymentType)}>
                  {(Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[]).map((t) => (
                    <option key={t} value={t}>{EMPLOYMENT_TYPE_LABEL[t]}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onChange={(e) => set('status', e.target.value as EmployeeStatus)}>
                  {(Object.keys(EMPLOYEE_STATUS_LABEL) as EmployeeStatus[]).map((s) => (
                    <option key={s} value={s}>{EMPLOYEE_STATUS_LABEL[s]}</option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Shift</Label>
                <Select value={form.shiftId} onChange={(e) => set('shiftId', e.target.value)}>
                  <option value="">No shift assigned</option>
                  {(shifts ?? []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.startTime}–{s.endTime})</option>
                  ))}
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h4 className="text-label font-semibold">Salary</h4>
            <div className="space-y-1.5">
              <Label>Salary type</Label>
              <Select value={form.salaryType} onChange={(e) => set('salaryType', e.target.value as SalaryType)}>
                {(Object.keys(SALARY_TYPE_LABEL) as SalaryType[]).map((t) => (
                  <option key={t} value={t}>{SALARY_TYPE_LABEL[t]}</option>
                ))}
              </Select>
              <p className="text-caption text-muted-foreground">Only one structure applies per employee — switching clears the others.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {form.salaryType === 'MONTHLY' && (
                <>
                  <Money label="Monthly salary (₹)" value={form.monthlySalary} onChange={(v) => set('monthlySalary', v)} />
                  <Money label="Basic salary (₹)" value={form.basicSalary} onChange={(v) => set('basicSalary', v)} />
                  <Money label="Allowances (₹)" value={form.allowances} onChange={(v) => set('allowances', v)} />
                  <Money label="Deductions (₹)" value={form.deductions} onChange={(v) => set('deductions', v)} />
                  <Money label="Overtime rate (₹/hr)" value={form.overtimeRate} onChange={(v) => set('overtimeRate', v)} />
                </>
              )}
              {form.salaryType === 'DAILY' && (
                <Money label="Per day salary (₹)" value={form.perDaySalary} onChange={(v) => set('perDaySalary', v)} />
              )}
              {form.salaryType === 'HOURLY' && (
                <Money label="Per hour salary (₹)" value={form.perHourSalary} onChange={(v) => set('perHourSalary', v)} />
              )}
              {form.salaryType === 'SHIFT' && (
                <>
                  <div className="space-y-1.5">
                    <Label>Shift name</Label>
                    <Input value={form.shiftSalaryName} onChange={(e) => set('shiftSalaryName', e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Shift duration (hours)</Label>
                    <Input type="number" step="0.5" value={form.shiftDurationHours} onChange={(e) => set('shiftDurationHours', Number(e.target.value))} />
                  </div>
                  <Money label="Shift salary (₹)" value={form.shiftSalary} onChange={(v) => set('shiftSalary', v)} />
                </>
              )}
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>{employee ? 'Save' : 'Add Employee'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Money({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" step="0.01" min={0} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

// ──────────────────────────────── Shifts ────────────────────────────────────
function ShiftsTab() {
  const { data, isLoading } = useShifts();
  const [editing, setEditing] = useState<Shift | null>(null);
  const [creating, setCreating] = useState(false);
  const del = useDeleteShift();

  const rows = data ?? [];

  const remove = (s: Shift) => {
    if (!window.confirm(`Remove the "${s.name}" shift?`)) return;
    del.mutate(s.id, {
      onSuccess: () => toast.success('Shift removed'),
      onError: (e) => toast.error(apiErrorMessage(e)),
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body text-muted-foreground">Working shifts employees can be assigned to.</p>
        <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add Shift</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !rows.length ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Clock className="h-8 w-8 text-muted-foreground" />
          <p className="text-body text-muted-foreground">No shifts yet.</p>
          <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add first shift</Button>
        </div>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Shift</TH><TH>Timing</TH><TH className="text-right">Break</TH><TH className="text-right">Hours</TH>
              <TH className="text-right">Grace</TH><TH className="text-right">Half day</TH><TH className="text-right">OT after</TH>
              <TH className="text-right">Staff</TH><TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((s) => (
              <TR key={s.id}>
                <TD className="font-medium">{s.name}</TD>
                <TD>{s.startTime} – {s.endTime}</TD>
                <TD className="text-right">{s.breakMinutes} min</TD>
                <TD className="text-right font-semibold">{Number(s.totalWorkingHours)} h</TD>
                <TD className="text-right">{s.graceMinutes} min</TD>
                <TD className="text-right">{s.halfDayHours ? `${Number(s.halfDayHours)} h` : <span className="text-muted-foreground">—</span>}</TD>
                <TD className="text-right">{s.overtimeAfterHours ? `${Number(s.overtimeAfterHours)} h` : <span className="text-muted-foreground">—</span>}</TD>
                <TD className="text-right">{s._count?.employees ?? 0}</TD>
                <TD>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Edit" onClick={() => setEditing(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" title="Remove" onClick={() => remove(s)}><Trash2 className="h-4 w-4 text-danger" /></Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      <ShiftFormDialog
        open={creating || !!editing}
        onOpenChange={(v) => { if (!v) { setCreating(false); setEditing(null); } }}
        shift={editing}
      />
    </Card>
  );
}

const emptyShift = {
  name: '', startTime: '09:00', endTime: '18:00', breakMinutes: 60,
  graceMinutes: 10, halfDayHours: 4, overtimeAfterHours: 8,
};

/** Clock hours between two HH:mm times minus the break — mirrors the server's own maths. */
function previewHours(startTime: string, endTime: string, breakMinutes: number): number {
  const mins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };
  const start = mins(startTime);
  const end = mins(endTime);
  const span = (end > start ? end - start : end + 24 * 60 - start) - breakMinutes;
  return Math.max(0, Number((span / 60).toFixed(2)));
}

function ShiftFormDialog({ open, onOpenChange, shift }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shift: Shift | null;
}) {
  const save = useSaveShift();
  const [form, setForm] = useState({ ...emptyShift });
  const set = <K extends keyof typeof emptyShift>(k: K, v: (typeof emptyShift)[K]) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setForm(
      shift
        ? {
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            breakMinutes: shift.breakMinutes,
            graceMinutes: shift.graceMinutes,
            halfDayHours: Number(shift.halfDayHours ?? 0),
            overtimeAfterHours: Number(shift.overtimeAfterHours ?? 0),
          }
        : { ...emptyShift },
    );
  }, [open, shift]);

  const hours = previewHours(form.startTime, form.endTime, form.breakMinutes);

  const submit = () => {
    if (form.name.trim().length < 2) { toast.error('Enter a shift name'); return; }
    save.mutate(
      {
        id: shift?.id,
        name: form.name.trim(),
        startTime: form.startTime,
        endTime: form.endTime,
        breakMinutes: form.breakMinutes,
        graceMinutes: form.graceMinutes,
        halfDayHours: form.halfDayHours || undefined,
        overtimeAfterHours: form.overtimeAfterHours || undefined,
      },
      {
        onSuccess: () => { toast.success(shift ? 'Shift updated' : 'Shift added'); onOpenChange(false); },
        onError: (e) => toast.error(apiErrorMessage(e)),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{shift ? `Edit ${shift.name}` : 'Add Shift'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label>Shift name</Label>
            <Input placeholder="e.g. Morning" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Start time</Label>
            <Input type="time" value={form.startTime} onChange={(e) => set('startTime', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>End time</Label>
            <Input type="time" value={form.endTime} onChange={(e) => set('endTime', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Break (minutes)</Label>
            <Input type="number" min={0} value={form.breakMinutes} onChange={(e) => set('breakMinutes', Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Grace time (minutes)</Label>
            <Input type="number" min={0} value={form.graceMinutes} onChange={(e) => set('graceMinutes', Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Half day under (hours)</Label>
            <Input type="number" step="0.5" min={0} value={form.halfDayHours} onChange={(e) => set('halfDayHours', Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Overtime after (hours)</Label>
            <Input type="number" step="0.5" min={0} value={form.overtimeAfterHours} onChange={(e) => set('overtimeAfterHours', Number(e.target.value))} />
          </div>
          <div className="sm:col-span-2 rounded-md border border-border bg-surface px-3 py-2 text-body">
            Total working hours: <span className="font-semibold">{hours} h</span>
            <span className="ml-1.5 text-caption text-muted-foreground">(start to end, minus break)</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={save.isPending}>{shift ? 'Save' : 'Add Shift'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
