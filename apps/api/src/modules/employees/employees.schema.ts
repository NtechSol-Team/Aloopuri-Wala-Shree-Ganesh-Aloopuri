import { z } from 'zod';
import { EmployeeStatus, EmploymentType, Gender, SalaryType } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';

// ─────────────────────────────── Shifts ─────────────────────────────────────
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = (label: string) => z.string().regex(HHMM, `${label} must be a time like 09:00`);

export const createShiftSchema = z.object({
  name: z.string().min(2).max(60),
  startTime: time('Start time'),
  endTime: time('End time'),
  breakMinutes: z.coerce.number().int().min(0).max(720).default(0),
  /// Optional on input — derived from start/end/break when omitted.
  totalWorkingHours: z.coerce.number().min(0).max(24).optional(),
  graceMinutes: z.coerce.number().int().min(0).max(240).default(0),
  halfDayHours: z.coerce.number().min(0).max(24).optional(),
  overtimeAfterHours: z.coerce.number().min(0).max(24).optional(),
});

export const updateShiftSchema = createShiftSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const listShiftsQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(60).optional(),
});

// ────────────────────────────── Employees ───────────────────────────────────
const money = z.coerce.number().nonnegative();

const employeeBase = z.object({
  employeeCode: z.string().max(40).optional(),
  name: z.string().min(2).max(120),
  mobile: z.string().max(20).optional(),
  email: z.string().email().max(120).optional().or(z.literal('')),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.nativeEnum(Gender).optional(),
  address: z.string().max(300).optional(),
  joiningDate: z.coerce.date().default(() => new Date()),
  employmentType: z.nativeEnum(EmploymentType).default(EmploymentType.FULL_TIME),
  status: z.nativeEnum(EmployeeStatus).default(EmployeeStatus.ACTIVE),
  department: z.string().max(80).optional(),
  shiftId: z.string().uuid().optional().nullable(),
  /// Optional link to this person's login account.
  userId: z.string().uuid().optional().nullable(),

  salaryType: z.nativeEnum(SalaryType).default(SalaryType.MONTHLY),
  monthlySalary: money.optional(),
  basicSalary: money.optional(),
  allowances: money.optional(),
  deductions: money.optional(),
  overtimeRate: money.optional(),
  perDaySalary: money.optional(),
  perHourSalary: money.optional(),
  shiftSalaryName: z.string().max(60).optional(),
  shiftDurationHours: z.coerce.number().min(0).max(24).optional(),
  shiftSalary: money.optional(),
});

/**
 * Exactly one salary structure is active per employee, so the figures that structure
 * needs are required and the rest are ignored. Enforced here rather than in the DB
 * because which columns matter depends on `salaryType`.
 */
function requireSalaryFields(
  v: { salaryType?: SalaryType; monthlySalary?: number; perDaySalary?: number; perHourSalary?: number; shiftSalary?: number },
  ctx: z.RefinementCtx,
) {
  const need = (field: keyof typeof v, label: string) => {
    if (v[field] === undefined || v[field] === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${label} is required for this salary type` });
    }
  };
  switch (v.salaryType) {
    case SalaryType.MONTHLY: need('monthlySalary', 'Monthly salary'); break;
    case SalaryType.DAILY: need('perDaySalary', 'Per day salary'); break;
    case SalaryType.HOURLY: need('perHourSalary', 'Per hour salary'); break;
    case SalaryType.SHIFT: need('shiftSalary', 'Shift salary'); break;
    default: break;
  }
}

export const createEmployeeSchema = employeeBase.superRefine(requireSalaryFields);

// `.partial()` can't be called on an effects-wrapped schema, so the refinement is
// re-applied to the partial base instead. On update the salary figure is only
// demanded when the salary type is actually being set.
export const updateEmployeeSchema = employeeBase
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .superRefine((v, ctx) => {
    if (v.salaryType !== undefined) requireSalaryFields(v, ctx);
  });

export const listEmployeesQuerySchema = paginationQuerySchema.extend({
  search: z.string().max(120).optional(),
  status: z.nativeEnum(EmployeeStatus).optional(),
  employmentType: z.nativeEnum(EmploymentType).optional(),
  department: z.string().max(80).optional(),
});

export type CreateShiftInput = z.infer<typeof createShiftSchema>;
export type UpdateShiftInput = z.infer<typeof updateShiftSchema>;
export type ListShiftsQuery = z.infer<typeof listShiftsQuerySchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
