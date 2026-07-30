-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_USE', 'IN_REPAIR', 'RETIRED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'RESIGNED', 'TERMINATED', 'ON_LEAVE');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "SalaryType" AS ENUM ('MONTHLY', 'DAILY', 'HOURLY', 'SHIFT');

-- AlterTable
ALTER TABLE "supplier_bill_items" ADD COLUMN     "is_asset" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "serial_number" TEXT,
    "quantity" DECIMAL(12,4) NOT NULL DEFAULT 1,
    "purchase_cost" DECIMAL(12,2) NOT NULL,
    "purchase_date" TIMESTAMPTZ(6) NOT NULL,
    "supplier_name" TEXT,
    "invoice_number" TEXT,
    "location" "ExpenseLocation" NOT NULL DEFAULT 'GENERAL',
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_USE',
    "supplier_bill_id" UUID,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "total_working_hours" DECIMAL(5,2) NOT NULL,
    "grace_minutes" INTEGER NOT NULL DEFAULT 0,
    "half_day_hours" DECIMAL(5,2),
    "overtime_after_hours" DECIMAL(5,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_no" TEXT NOT NULL,
    "employee_code" TEXT,
    "name" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "date_of_birth" TIMESTAMPTZ(6),
    "gender" "Gender",
    "address" TEXT,
    "joining_date" TIMESTAMPTZ(6) NOT NULL,
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "department" TEXT,
    "shift_id" UUID,
    "user_id" UUID,
    "salary_type" "SalaryType" NOT NULL DEFAULT 'MONTHLY',
    "monthly_salary" DECIMAL(12,2),
    "basic_salary" DECIMAL(12,2),
    "allowances" DECIMAL(12,2),
    "deductions" DECIMAL(12,2),
    "overtime_rate" DECIMAL(12,2),
    "per_day_salary" DECIMAL(12,2),
    "per_hour_salary" DECIMAL(12,2),
    "shift_salary_name" TEXT,
    "shift_duration_hours" DECIMAL(5,2),
    "shift_salary" DECIMAL(12,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_asset_code_key" ON "assets"("asset_code");

-- CreateIndex
CREATE INDEX "assets_status_idx" ON "assets"("status");

-- CreateIndex
CREATE INDEX "assets_supplier_bill_id_idx" ON "assets"("supplier_bill_id");

-- CreateIndex
CREATE INDEX "assets_is_deleted_idx" ON "assets"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_name_key" ON "shifts"("name");

-- CreateIndex
CREATE INDEX "shifts_is_deleted_idx" ON "shifts"("is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_no_key" ON "employees"("employee_no");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE INDEX "employees_shift_id_idx" ON "employees"("shift_id");

-- CreateIndex
CREATE INDEX "employees_department_idx" ON "employees"("department");

-- CreateIndex
CREATE INDEX "employees_is_deleted_idx" ON "employees"("is_deleted");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_supplier_bill_id_fkey" FOREIGN KEY ("supplier_bill_id") REFERENCES "supplier_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
