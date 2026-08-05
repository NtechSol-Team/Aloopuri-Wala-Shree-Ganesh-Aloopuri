-- CreateEnum
CREATE TYPE "PaidBy" AS ENUM ('COMPANY', 'KALPESHBHAI', 'MAYURBHAI');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "paid_by" "PaidBy" NOT NULL DEFAULT 'COMPANY';

-- CreateIndex
CREATE INDEX "expenses_paid_by_expense_date_idx" ON "expenses"("paid_by", "expense_date");
