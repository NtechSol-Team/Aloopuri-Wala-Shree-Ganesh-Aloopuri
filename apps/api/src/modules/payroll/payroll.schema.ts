import { z } from 'zod';
import { PayrollStatus, PaymentMethod, AdvanceStatus } from '@prisma/client';
import { istDate } from '../../shared/utils/date';

const money = z.coerce.number().nonnegative();
const days = z.coerce.number().min(0).max(366);

const year = z.coerce.number().int().min(2000).max(2100);
const month = z.coerce.number().int().min(1).max(12);

export const periodQuerySchema = z.object({ year, month });

// ───────────────────────────── Attendance ───────────────────────────────────
export const saveAttendanceSchema = z.object({
  employeeId: z.string().uuid(),
  year,
  month,
  totalWorkingDays: days,
  presentDays: days.default(0),
  absentDays: days.default(0),
  halfDays: days.default(0),
  paidLeave: days.default(0),
  unpaidLeave: days.default(0),
  overtimeHours: z.coerce.number().min(0).max(1000).default(0),
  workingHours: z.coerce.number().min(0).max(1000).optional(),
  notes: z.string().max(300).optional(),
});

export const listAttendanceQuerySchema = z.object({
  year,
  month,
  employeeId: z.string().uuid().optional(),
});

// ────────────────────────────── Payroll ─────────────────────────────────────
/** Generate (or regenerate) payroll for a whole month. */
export const generatePayrollSchema = z.object({
  year,
  month,
  /** Limit the run to specific employees; omitted = every active employee with attendance. */
  employeeIds: z.array(z.string().uuid()).optional(),
});

/** Manual adjustments an admin can apply to a generated row before paying it. */
export const updatePayrollSchema = z.object({
  bonus: money.optional(),
  incentives: money.optional(),
  advanceRecovery: money.optional(),
  loanRecovery: money.optional(),
  allowances: money.optional(),
  deductions: money.optional(),
  notes: z.string().max(300).optional(),
});

export const markPaidSchema = z.object({
  paymentDate: istDate.default(() => new Date()),
});

export const listPayrollQuerySchema = z.object({
  year,
  month,
  status: z.nativeEnum(PayrollStatus).optional(),
  employeeId: z.string().uuid().optional(),
});

// ─────────────────────────── Employee advances ──────────────────────────────
export const createAdvanceSchema = z.object({
  employeeId: z.string().uuid(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  givenDate: istDate.default(() => new Date()),
  paymentMethod: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  notes: z.string().max(300).optional(),
});

/** Only reachable while nothing has been recovered yet — see advances.service.ts. */
export const updateAdvanceSchema = createAdvanceSchema.omit({ employeeId: true }).partial();

export const listAdvancesQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  status: z.nativeEnum(AdvanceStatus).optional(),
});

export type PeriodQuery = z.infer<typeof periodQuerySchema>;
export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;
export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;
export type GeneratePayrollInput = z.infer<typeof generatePayrollSchema>;
export type UpdatePayrollInput = z.infer<typeof updatePayrollSchema>;
export type MarkPaidInput = z.infer<typeof markPaidSchema>;
export type ListPayrollQuery = z.infer<typeof listPayrollQuerySchema>;
export type CreateAdvanceInput = z.infer<typeof createAdvanceSchema>;
export type UpdateAdvanceInput = z.infer<typeof updateAdvanceSchema>;
export type ListAdvancesQuery = z.infer<typeof listAdvancesQuerySchema>;
