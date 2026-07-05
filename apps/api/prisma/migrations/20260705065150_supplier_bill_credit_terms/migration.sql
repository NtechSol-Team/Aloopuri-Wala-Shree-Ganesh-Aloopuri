-- AlterTable
ALTER TABLE "supplier_bills" ADD COLUMN     "credit_days" INTEGER,
ADD COLUMN     "due_date" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "supplier_bills_status_due_date_idx" ON "supplier_bills"("status", "due_date");
