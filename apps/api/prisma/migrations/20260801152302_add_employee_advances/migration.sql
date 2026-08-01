-- CreateEnum
CREATE TYPE "AdvanceStatus" AS ENUM ('OUTSTANDING', 'RECOVERED');

-- CreateTable
CREATE TABLE "employee_advances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "advance_no" TEXT NOT NULL,
    "employee_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "amount_recovered" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "given_date" TIMESTAMPTZ(6) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "status" "AdvanceStatus" NOT NULL DEFAULT 'OUTSTANDING',
    "notes" TEXT,
    "expense_id" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "employee_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advance_recovery_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "advance_id" UUID NOT NULL,
    "payroll_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advance_recovery_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_advances_advance_no_key" ON "employee_advances"("advance_no");

-- CreateIndex
CREATE UNIQUE INDEX "employee_advances_expense_id_key" ON "employee_advances"("expense_id");

-- CreateIndex
CREATE INDEX "employee_advances_employee_id_idx" ON "employee_advances"("employee_id");

-- CreateIndex
CREATE INDEX "employee_advances_status_idx" ON "employee_advances"("status");

-- CreateIndex
CREATE UNIQUE INDEX "advance_recovery_entries_advance_id_payroll_id_key" ON "advance_recovery_entries"("advance_id", "payroll_id");

-- AddForeignKey
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_recovery_entries" ADD CONSTRAINT "advance_recovery_entries_advance_id_fkey" FOREIGN KEY ("advance_id") REFERENCES "employee_advances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advance_recovery_entries" ADD CONSTRAINT "advance_recovery_entries_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payroll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
