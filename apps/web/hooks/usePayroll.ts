'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';
import type { SalaryType } from './useEmployees';

export type PayrollStatus = 'PENDING' | 'PAID';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export interface Period { year: number; month: number }

export interface AttendanceRow {
  id: string;
  employeeId: string;
  year: number;
  month: number;
  totalWorkingDays: string;
  presentDays: string;
  absentDays: string;
  halfDays: string;
  paidLeave: string;
  unpaidLeave: string;
  overtimeHours: string;
  workingHours: string | null;
  notes: string | null;
  payableDays: number;
  employee: { id: string; employeeNo: string; name: string; department: string | null; salaryType: SalaryType };
}

export interface PayrollRow {
  id: string;
  payrollNo: string;
  employeeId: string;
  year: number;
  month: number;
  salaryType: SalaryType;
  totalWorkingDays: string;
  presentDays: string;
  halfDays: string;
  paidLeave: string;
  unpaidLeave: string;
  overtimeHours: string;
  workingHours: string;
  payableDays: string;
  grossSalary: string;
  allowances: string;
  overtimeAmount: string;
  bonus: string;
  incentives: string;
  deductions: string;
  advanceRecovery: string;
  loanRecovery: string;
  netSalary: string;
  status: PayrollStatus;
  paymentDate: string | null;
  expenseId: string | null;
  notes: string | null;
  employee: {
    id: string; employeeNo: string; employeeCode: string | null; name: string;
    department: string | null; mobile: string | null; employmentType: string;
    shift: { name: string } | null;
  };
}

export interface PayrollTotals { gross: number; net: number; paid: number; pending: number }

export interface PayrollDashboard {
  period: string;
  totalEmployees: number;
  activeEmployees: number;
  payrollProcessed: number;
  payrollPending: number;
  totalSalaryExpense: number;
  pendingSalaryAmount: number;
  attendance: {
    employeesRecorded: number;
    presentDays: number; absentDays: number; halfDays: number;
    paidLeave: number; unpaidLeave: number; overtimeHours: number;
  };
  byDepartment: Array<{ department: string; count: number }>;
}

// ───────────────────────────── Attendance ───────────────────────────────────
export function useAttendance(period: Period) {
  return useQuery({
    queryKey: ['payroll', 'attendance', period],
    queryFn: async () => (await api.get<ApiSuccess<AttendanceRow[]>>('/payroll/attendance', { params: period })).data.data,
  });
}

export interface SaveAttendanceInput {
  employeeId: string;
  year: number;
  month: number;
  totalWorkingDays: number;
  presentDays: number;
  absentDays: number;
  halfDays: number;
  paidLeave: number;
  unpaidLeave: number;
  overtimeHours: number;
  workingHours?: number;
  notes?: string;
}

export function useSaveAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveAttendanceInput) => (await api.put<ApiSuccess<AttendanceRow>>('/payroll/attendance', input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

// ────────────────────────────── Payroll ─────────────────────────────────────
export function usePayroll(period: Period) {
  return useQuery({
    queryKey: ['payroll', 'list', period],
    queryFn: async () =>
      (await api.get<ApiSuccess<{ rows: PayrollRow[]; totals: PayrollTotals }>>('/payroll', { params: period })).data.data,
  });
}

export function useGeneratePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Period) =>
      (await api.post<ApiSuccess<{ period: string; created: number; updated: number; skippedPaid: number; skippedNoAttendance: string[] }>>(
        '/payroll/generate', input,
      )).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

export function useUpdatePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: {
      id: string; bonus?: number; incentives?: number; advanceRecovery?: number;
      loanRecovery?: number; allowances?: number; deductions?: number; notes?: string;
    }) => (await api.patch<ApiSuccess<PayrollRow>>(`/payroll/${id}`, input)).data.data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
  });
}

export function useMarkPayrollPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, paymentDate }: { id: string; paymentDate: string }) =>
      (await api.post<ApiSuccess<PayrollRow>>(`/payroll/${id}/pay`, { paymentDate })).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll'] });
      // Paying books an Expense, which feeds the P&L.
      ['expenses', 'expense-summary', 'accounting', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
  });
}

export function useRevertPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.post<ApiSuccess<PayrollRow>>(`/payroll/${id}/revert`, {})).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll'] });
      ['expenses', 'expense-summary', 'accounting', 'dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
  });
}

/** Fetches the slip through the authenticated API (it isn't a public file) and opens it. */
export async function openPayslip(id: string, payrollNo: string) {
  const res = await api.get(`/payroll/${id}/slip.pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // Popup blocked — fall back to a direct download so the slip isn't simply lost.
    const a = document.createElement('a');
    a.href = url;
    a.download = `${payrollNo}.pdf`;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ─────────────────────── Dashboard + reports ────────────────────────────────
export function usePayrollDashboard(period: Period) {
  return useQuery({
    queryKey: ['payroll', 'dashboard', period],
    queryFn: async () => (await api.get<ApiSuccess<PayrollDashboard>>('/payroll/dashboard', { params: period })).data.data,
  });
}

export interface EmployeeMasterReportRow {
  employeeNo: string; employeeCode: string | null; name: string; mobile: string | null; email: string | null;
  department: string | null; employmentType: string; status: string; joiningDate: string; gender: string | null;
  salaryType: SalaryType;
  monthlySalary: string | null; perDaySalary: string | null; perHourSalary: string | null; shiftSalary: string | null;
  shift: { name: string } | null;
}

export function useEmployeeMasterReport(enabled: boolean) {
  return useQuery({
    queryKey: ['payroll', 'report', 'employees'],
    enabled,
    queryFn: async () => (await api.get<ApiSuccess<EmployeeMasterReportRow[]>>('/payroll/reports/employees')).data.data,
  });
}

export function useAttendanceReport(period: Period, enabled: boolean) {
  return useQuery({
    queryKey: ['payroll', 'report', 'attendance', period],
    enabled,
    queryFn: async () => (await api.get<ApiSuccess<AttendanceRow[]>>('/payroll/reports/attendance', { params: period })).data.data,
  });
}

export function useSalaryRegisterReport(period: Period, enabled: boolean) {
  return useQuery({
    queryKey: ['payroll', 'report', 'register', period],
    enabled,
    queryFn: async () =>
      (await api.get<ApiSuccess<{ period: string; rows: PayrollRow[]; totals: PayrollTotals }>>('/payroll/reports/register', { params: period })).data.data,
  });
}

export interface MonthlySummaryRow {
  month: number; monthName: string; employees: number;
  gross: number; net: number; deductions: number; overtime: number;
}

export function useMonthlySummaryReport(year: number, enabled: boolean) {
  return useQuery({
    queryKey: ['payroll', 'report', 'monthly', year],
    enabled,
    queryFn: async () => (await api.get<ApiSuccess<MonthlySummaryRow[]>>('/payroll/reports/monthly', { params: { year } })).data.data,
  });
}

/**
 * Download rows as CSV. Built by hand rather than pulling in a dependency — the app
 * has no spreadsheet library and this is the only place that needs one.
 */
export function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escape = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Quote anything containing a comma, quote or newline; double up inner quotes.
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
