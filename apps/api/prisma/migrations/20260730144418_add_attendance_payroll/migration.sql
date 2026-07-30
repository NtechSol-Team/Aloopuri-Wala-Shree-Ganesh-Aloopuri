-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('PENDING', 'PAID');

-- CreateTable
CREATE TABLE "attendance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "total_working_days" DECIMAL(6,2) NOT NULL,
    "present_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "absent_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "half_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "paid_leave" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "unpaid_leave" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "overtime_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "working_hours" DECIMAL(8,2),
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payroll_no" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "salary_type" "SalaryType" NOT NULL,
    "monthly_salary" DECIMAL(12,2),
    "per_day_salary" DECIMAL(12,2),
    "per_hour_salary" DECIMAL(12,2),
    "shift_salary" DECIMAL(12,2),
    "overtime_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_working_days" DECIMAL(6,2) NOT NULL,
    "present_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "half_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "paid_leave" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "unpaid_leave" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "overtime_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "working_hours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "payable_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "gross_salary" DECIMAL(12,2) NOT NULL,
    "allowances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "overtime_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonus" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "incentives" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "advance_recovery" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "loan_recovery" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_salary" DECIMAL(12,2) NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'PENDING',
    "payment_date" TIMESTAMPTZ(6),
    "expense_id" UUID,
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "payroll_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_year_month_idx" ON "attendance"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_employee_id_year_month_key" ON "attendance"("employee_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payroll_no_key" ON "payroll"("payroll_no");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_expense_id_key" ON "payroll"("expense_id");

-- CreateIndex
CREATE INDEX "payroll_year_month_idx" ON "payroll"("year", "month");

-- CreateIndex
CREATE INDEX "payroll_status_idx" ON "payroll"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_employee_id_year_month_key" ON "payroll"("employee_id", "year", "month");

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll" ADD CONSTRAINT "payroll_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll" ADD CONSTRAINT "payroll_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
