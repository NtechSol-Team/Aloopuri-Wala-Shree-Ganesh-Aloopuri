import { Prisma, SalaryType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import { nextDocNumber } from '../../shared/utils/docNumber';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import type {
  CreateEmployeeInput, CreateShiftInput, ListEmployeesQuery, ListShiftsQuery,
  UpdateEmployeeInput, UpdateShiftInput,
} from './employees.schema';

function invalidate(): void {
  cache.invalidateTags(CacheTag.EMPLOYEES);
}

// ─────────────────────────────── Shifts ─────────────────────────────────────
const shiftSelect = {
  id: true, name: true, startTime: true, endTime: true, breakMinutes: true,
  totalWorkingHours: true, graceMinutes: true, halfDayHours: true, overtimeAfterHours: true,
  isActive: true,
  _count: { select: { employees: { where: { isDeleted: false } } } },
} satisfies Prisma.ShiftSelect;

/**
 * Clock hours between two "HH:mm" times, minus the break. Handles a shift that runs
 * past midnight (e.g. 22:00 → 06:00) by rolling into the next day.
 */
function workingHoursFor(startTime: string, endTime: string, breakMinutes: number): number {
  const mins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const start = mins(startTime);
  const end = mins(endTime);
  const span = (end > start ? end - start : end + 24 * 60 - start) - breakMinutes;
  return Math.max(0, Number((span / 60).toFixed(2)));
}

export async function listShifts(query: ListShiftsQuery) {
  const where: Prisma.ShiftWhereInput = {
    isDeleted: false,
    ...(query.search ? { name: { contains: query.search, mode: 'insensitive' } } : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [rows, total] = await Promise.all([
    prisma.shift.findMany({ where, select: shiftSelect, orderBy: { name: 'asc' }, skip, take }),
    prisma.shift.count({ where }),
  ]);
  return { rows, meta: buildPaginationMeta(query, total) };
}

async function assertShiftNameFree(name: string, exceptId?: string) {
  const clash = await prisma.shift.findFirst({
    where: { name, isDeleted: false, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (clash) throw AppError.conflict('A shift with this name already exists', 'name');
}

export async function createShift(input: CreateShiftInput, createdById: string) {
  await assertShiftNameFree(input.name);
  const totalWorkingHours = input.totalWorkingHours ?? workingHoursFor(input.startTime, input.endTime, input.breakMinutes);
  const shift = await prisma.shift.create({
    data: { ...input, totalWorkingHours, createdById },
    select: shiftSelect,
  });
  invalidate();
  return shift;
}

export async function updateShift(id: string, input: UpdateShiftInput) {
  const existing = await prisma.shift.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Shift not found');
  if (input.name) await assertShiftNameFree(input.name, id);

  // Recompute the derived hours whenever any of its inputs move and the caller
  // hasn't supplied an explicit override.
  const startTime = input.startTime ?? existing.startTime;
  const endTime = input.endTime ?? existing.endTime;
  const breakMinutes = input.breakMinutes ?? existing.breakMinutes;
  const touchesClock = input.startTime !== undefined || input.endTime !== undefined || input.breakMinutes !== undefined;
  const totalWorkingHours = input.totalWorkingHours ?? (touchesClock ? workingHoursFor(startTime, endTime, breakMinutes) : undefined);

  const shift = await prisma.shift.update({
    where: { id },
    data: { ...input, ...(totalWorkingHours !== undefined ? { totalWorkingHours } : {}) },
    select: shiftSelect,
  });
  invalidate();
  return shift;
}

export async function deleteShift(id: string) {
  const existing = await prisma.shift.findFirst({
    where: { id, isDeleted: false },
    select: { id: true, name: true, _count: { select: { employees: { where: { isDeleted: false } } } } },
  });
  if (!existing) throw AppError.notFound('Shift not found');
  if (existing._count.employees > 0) {
    throw AppError.conflict(`${existing._count.employees} employee(s) are on the "${existing.name}" shift. Reassign them first.`);
  }
  // Free the name: it is @unique across soft-deleted rows too, so leaving it would
  // block ever re-creating a shift with the same name.
  await prisma.shift.update({
    where: { id },
    data: { isDeleted: true, isActive: false, name: `${existing.name}__deleted__${Date.now()}` },
  });
  invalidate();
  return { deleted: true };
}

// ────────────────────────────── Employees ───────────────────────────────────
const employeeSelect = {
  id: true, employeeNo: true, employeeCode: true, name: true, mobile: true, email: true,
  dateOfBirth: true, gender: true, address: true, joiningDate: true, employmentType: true,
  status: true, department: true, isActive: true,
  salaryType: true, monthlySalary: true, basicSalary: true, allowances: true, deductions: true,
  overtimeRate: true, perDaySalary: true, perHourSalary: true,
  shiftSalaryName: true, shiftDurationHours: true, shiftSalary: true,
  shiftId: true, shift: { select: { id: true, name: true, startTime: true, endTime: true } },
  userId: true, user: { select: { id: true, name: true, userId: true, role: true } },
} satisfies Prisma.EmployeeSelect;

export async function listEmployees(query: ListEmployeesQuery) {
  const where: Prisma.EmployeeWhereInput = {
    isDeleted: false,
    ...(query.status ? { status: query.status } : {}),
    ...(query.employmentType ? { employmentType: query.employmentType } : {}),
    ...(query.department ? { department: query.department } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { employeeNo: { contains: query.search, mode: 'insensitive' } },
            { employeeCode: { contains: query.search, mode: 'insensitive' } },
            { mobile: { contains: query.search } },
          ],
        }
      : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [rows, total] = await Promise.all([
    prisma.employee.findMany({ where, select: employeeSelect, orderBy: { name: 'asc' }, skip, take }),
    prisma.employee.count({ where }),
  ]);
  return { rows, meta: buildPaginationMeta(query, total) };
}

/** Blank out the salary columns that don't belong to the chosen structure. */
function salaryFieldsFor<T extends { salaryType?: SalaryType }>(input: T) {
  if (input.salaryType === undefined) return {};
  const blank = {
    monthlySalary: null, basicSalary: null, allowances: null, deductions: null, overtimeRate: null,
    perDaySalary: null, perHourSalary: null,
    shiftSalaryName: null, shiftDurationHours: null, shiftSalary: null,
  };
  const keep: Record<SalaryType, Array<keyof typeof blank>> = {
    MONTHLY: ['monthlySalary', 'basicSalary', 'allowances', 'deductions', 'overtimeRate'],
    DAILY: ['perDaySalary'],
    HOURLY: ['perHourSalary'],
    SHIFT: ['shiftSalaryName', 'shiftDurationHours', 'shiftSalary'],
  };
  const cleared = { ...blank };
  for (const field of keep[input.salaryType]) delete (cleared as Record<string, unknown>)[field];
  return cleared;
}

async function assertRefsValid(input: { shiftId?: string | null; userId?: string | null }, exceptEmployeeId?: string) {
  if (input.shiftId) {
    const shift = await prisma.shift.findFirst({ where: { id: input.shiftId, isDeleted: false }, select: { id: true } });
    if (!shift) throw AppError.badRequest('That shift does not exist', undefined, 'shiftId');
  }
  if (input.userId) {
    const user = await prisma.user.findFirst({ where: { id: input.userId, isDeleted: false }, select: { id: true } });
    if (!user) throw AppError.badRequest('That login account does not exist', undefined, 'userId');
    const taken = await prisma.employee.findFirst({
      where: { userId: input.userId, isDeleted: false, ...(exceptEmployeeId ? { id: { not: exceptEmployeeId } } : {}) },
      select: { employeeNo: true },
    });
    if (taken) throw AppError.conflict(`That login is already linked to employee ${taken.employeeNo}`, 'userId');
  }
}

export async function createEmployee(input: CreateEmployeeInput, createdById: string) {
  await assertRefsValid(input);
  const { email, ...rest } = input;
  const employee = await prisma.$transaction(async (tx) => {
    const employeeNo = await nextDocNumber(tx, 'EMPLOYEE');
    return tx.employee.create({
      data: {
        ...rest,
        // A blank email from the form is "not provided", not an empty string.
        email: email || null,
        ...salaryFieldsFor(input),
        employeeNo,
        createdById,
      },
      select: employeeSelect,
    });
  });
  invalidate();
  return employee;
}

export async function updateEmployee(id: string, input: UpdateEmployeeInput) {
  const existing = await prisma.employee.findFirst({ where: { id, isDeleted: false }, select: { id: true } });
  if (!existing) throw AppError.notFound('Employee not found');
  await assertRefsValid(input, id);
  const { email, ...rest } = input;
  const employee = await prisma.employee.update({
    where: { id },
    data: {
      ...rest,
      ...(email !== undefined ? { email: email || null } : {}),
      ...salaryFieldsFor(input),
    },
    select: employeeSelect,
  });
  invalidate();
  return employee;
}

export async function deleteEmployee(id: string) {
  const existing = await prisma.employee.findFirst({ where: { id, isDeleted: false }, select: { id: true } });
  if (!existing) throw AppError.notFound('Employee not found');
  await prisma.employee.update({ where: { id }, data: { isDeleted: true, isActive: false, userId: null } });
  invalidate();
  return { deleted: true };
}

export const employeesService = {
  listShifts, createShift, updateShift, deleteShift,
  listEmployees, createEmployee, updateEmployee, deleteEmployee,
};
