-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "outlet_id" UUID;

-- AlterTable
ALTER TABLE "supplier_bills" ADD COLUMN     "outlet_id" UUID;

-- CreateIndex
CREATE INDEX "expenses_outlet_id_expense_date_idx" ON "expenses"("outlet_id", "expense_date");

-- CreateIndex
CREATE INDEX "supplier_bills_outlet_id_bill_date_idx" ON "supplier_bills"("outlet_id", "bill_date");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
