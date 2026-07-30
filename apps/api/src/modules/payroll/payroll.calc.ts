import { Prisma, SalaryType } from '@prisma/client';

const D = (v: Prisma.Decimal | number | null | undefined) => new Prisma.Decimal(v ?? 0);

export interface SalaryStructure {
  salaryType: SalaryType;
  monthlySalary?: Prisma.Decimal | null;
  perDaySalary?: Prisma.Decimal | null;
  perHourSalary?: Prisma.Decimal | null;
  shiftSalary?: Prisma.Decimal | null;
  allowances?: Prisma.Decimal | null;
  deductions?: Prisma.Decimal | null;
  overtimeRate?: Prisma.Decimal | null;
}

export interface AttendanceFigures {
  totalWorkingDays: Prisma.Decimal | number;
  presentDays: Prisma.Decimal | number;
  halfDays: Prisma.Decimal | number;
  paidLeave: Prisma.Decimal | number;
  unpaidLeave: Prisma.Decimal | number;
  overtimeHours: Prisma.Decimal | number;
  workingHours?: Prisma.Decimal | number | null;
}

/** Manual one-off amounts the admin adds on top of the calculated figures. */
export interface PayrollAdjustments {
  bonus?: number;
  incentives?: number;
  advanceRecovery?: number;
  loanRecovery?: number;
  /** Overrides the structure's own allowances/deductions when supplied. */
  allowances?: number;
  deductions?: number;
}

export interface PayrollComputation {
  payableDays: Prisma.Decimal;
  grossSalary: Prisma.Decimal;
  allowances: Prisma.Decimal;
  overtimeAmount: Prisma.Decimal;
  bonus: Prisma.Decimal;
  incentives: Prisma.Decimal;
  deductions: Prisma.Decimal;
  advanceRecovery: Prisma.Decimal;
  loanRecovery: Prisma.Decimal;
  netSalary: Prisma.Decimal;
}

/**
 * Days actually paid for. A half day counts as half; unpaid leave is simply absent
 * from the total rather than subtracted, so it can never push the figure negative.
 */
export function payableDaysFor(a: AttendanceFigures): Prisma.Decimal {
  return D(a.presentDays).add(D(a.paidLeave)).add(D(a.halfDays).div(2));
}

/**
 * Work out one employee's pay for one month.
 *
 * Each salary type has its own basis:
 *  • MONTHLY — the monthly figure pro-rated over the days actually worked, so
 *    unpaid absence reduces pay. With no working days recorded the month can't be
 *    pro-rated, so the full salary stands rather than silently paying zero.
 *  • DAILY   — per-day rate × payable days.
 *  • HOURLY  — hourly rate × hours actually worked.
 *  • SHIFT   — per-shift rate × shifts completed (a half day is half a shift).
 *
 * Overtime is always hours × the structure's overtime rate, on top of gross.
 */
export function computePayroll(
  structure: SalaryStructure,
  attendance: AttendanceFigures,
  adjustments: PayrollAdjustments = {},
): PayrollComputation {
  const payableDays = payableDaysFor(attendance);
  const totalWorkingDays = D(attendance.totalWorkingDays);

  let grossSalary: Prisma.Decimal;
  switch (structure.salaryType) {
    case SalaryType.MONTHLY: {
      const monthly = D(structure.monthlySalary);
      grossSalary = totalWorkingDays.greaterThan(0)
        ? monthly.div(totalWorkingDays).mul(payableDays)
        : monthly;
      break;
    }
    case SalaryType.DAILY:
      grossSalary = D(structure.perDaySalary).mul(payableDays);
      break;
    case SalaryType.HOURLY:
      grossSalary = D(structure.perHourSalary).mul(D(attendance.workingHours));
      break;
    case SalaryType.SHIFT:
      grossSalary = D(structure.shiftSalary).mul(payableDays);
      break;
  }

  const overtimeAmount = D(attendance.overtimeHours).mul(D(structure.overtimeRate));
  const allowances = adjustments.allowances !== undefined ? D(adjustments.allowances) : D(structure.allowances);
  const deductions = adjustments.deductions !== undefined ? D(adjustments.deductions) : D(structure.deductions);
  const bonus = D(adjustments.bonus);
  const incentives = D(adjustments.incentives);
  const advanceRecovery = D(adjustments.advanceRecovery);
  const loanRecovery = D(adjustments.loanRecovery);

  const earnings = grossSalary.add(allowances).add(overtimeAmount).add(bonus).add(incentives);
  const withheld = deductions.add(advanceRecovery).add(loanRecovery);
  // Recoveries can exceed earnings in a bad month; a negative payslip is meaningless,
  // so the balance simply carries rather than showing money owed back.
  const netSalary = Prisma.Decimal.max(earnings.sub(withheld), new Prisma.Decimal(0));

  const r = (d: Prisma.Decimal) => d.toDecimalPlaces(2);
  return {
    payableDays: payableDays.toDecimalPlaces(2),
    grossSalary: r(grossSalary),
    allowances: r(allowances),
    overtimeAmount: r(overtimeAmount),
    bonus: r(bonus),
    incentives: r(incentives),
    deductions: r(deductions),
    advanceRecovery: r(advanceRecovery),
    loanRecovery: r(loanRecovery),
    netSalary: r(netSalary),
  };
}
