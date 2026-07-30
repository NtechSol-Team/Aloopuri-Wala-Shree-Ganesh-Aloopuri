'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ApiSuccess } from '@/types/api';

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'TEMPORARY';
export type EmployeeStatus = 'ACTIVE' | 'RESIGNED' | 'TERMINATED' | 'ON_LEAVE';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type SalaryType = 'MONTHLY' | 'DAILY' | 'HOURLY' | 'SHIFT';

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: 'Full Time',
  PART_TIME: 'Part Time',
  CONTRACT: 'Contract',
  TEMPORARY: 'Temporary',
};

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  ACTIVE: 'Active',
  RESIGNED: 'Resigned',
  TERMINATED: 'Terminated',
  ON_LEAVE: 'On Leave',
};

export const EMPLOYEE_STATUS_BADGE: Record<EmployeeStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  ON_LEAVE: 'warning',
  RESIGNED: 'neutral',
  TERMINATED: 'danger',
};

export const SALARY_TYPE_LABEL: Record<SalaryType, string> = {
  MONTHLY: 'Monthly Salary',
  DAILY: 'Daily Wage',
  HOURLY: 'Hourly Wage',
  SHIFT: 'Shift Based',
};

export interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  totalWorkingHours: string;
  graceMinutes: number;
  halfDayHours: string | null;
  overtimeAfterHours: string | null;
  isActive: boolean;
  _count?: { employees: number };
}

export interface Employee {
  id: string;
  employeeNo: string;
  employeeCode: string | null;
  name: string;
  mobile: string | null;
  email: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  address: string | null;
  joiningDate: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  department: string | null;
  isActive: boolean;
  salaryType: SalaryType;
  monthlySalary: string | null;
  basicSalary: string | null;
  allowances: string | null;
  deductions: string | null;
  overtimeRate: string | null;
  perDaySalary: string | null;
  perHourSalary: string | null;
  shiftSalaryName: string | null;
  shiftDurationHours: string | null;
  shiftSalary: string | null;
  shiftId: string | null;
  shift: { id: string; name: string; startTime: string; endTime: string } | null;
  userId: string | null;
  user: { id: string; name: string; userId: string; role: string } | null;
}

/** The pay figure that actually applies, given the employee's salary type. */
export function activeSalary(e: Employee): { label: string; amount: number } {
  switch (e.salaryType) {
    case 'MONTHLY': return { label: 'per month', amount: Number(e.monthlySalary ?? 0) };
    case 'DAILY': return { label: 'per day', amount: Number(e.perDaySalary ?? 0) };
    case 'HOURLY': return { label: 'per hour', amount: Number(e.perHourSalary ?? 0) };
    case 'SHIFT': return { label: 'per shift', amount: Number(e.shiftSalary ?? 0) };
  }
}

// ─────────────────────────────── Shifts ─────────────────────────────────────
export interface SaveShiftInput {
  id?: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  graceMinutes: number;
  halfDayHours?: number;
  overtimeAfterHours?: number;
}

export function useShifts(params: { search?: string } = {}) {
  return useQuery({
    queryKey: ['shifts', params],
    queryFn: async () => (await api.get<ApiSuccess<Shift[]>>('/shifts', { params: { limit: 100, ...params } })).data.data,
  });
}

export function useSaveShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: SaveShiftInput) =>
      id
        ? (await api.patch<ApiSuccess<Shift>>(`/shifts/${id}`, input)).data.data
        : (await api.post<ApiSuccess<Shift>>('/shifts', input)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shifts'] });
      // Employees embed their shift's name/times.
      qc.invalidateQueries({ queryKey: ['employees'] });
    },
  });
}

export function useDeleteShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/shifts/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
  });
}

// ────────────────────────────── Employees ───────────────────────────────────
export interface SaveEmployeeInput {
  id?: string;
  employeeCode?: string;
  name: string;
  mobile?: string;
  email?: string;
  dateOfBirth?: string;
  gender?: Gender;
  address?: string;
  joiningDate: string;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  department?: string;
  shiftId?: string | null;
  userId?: string | null;
  salaryType: SalaryType;
  monthlySalary?: number;
  basicSalary?: number;
  allowances?: number;
  deductions?: number;
  overtimeRate?: number;
  perDaySalary?: number;
  perHourSalary?: number;
  shiftSalaryName?: string;
  shiftDurationHours?: number;
  shiftSalary?: number;
}

export function useEmployees(params: { search?: string; status?: EmployeeStatus; department?: string } = {}) {
  return useQuery({
    queryKey: ['employees', params],
    queryFn: async () => (await api.get<ApiSuccess<Employee[]>>('/employees', { params: { limit: 100, ...params } })).data.data,
  });
}

export function useSaveEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: SaveEmployeeInput) =>
      id
        ? (await api.patch<ApiSuccess<Employee>>(`/employees/${id}`, input)).data.data
        : (await api.post<ApiSuccess<Employee>>('/employees', input)).data.data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      // A shift's employee count changes with assignment.
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/employees/${id}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['shifts'] });
    },
  });
}
