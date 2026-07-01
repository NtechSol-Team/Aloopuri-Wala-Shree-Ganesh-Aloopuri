-- CreateEnum
CREATE TYPE "SupplierBillStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "supplier_bill_id" UUID;

-- AlterTable
ALTER TABLE "raw_material_intake" ADD COLUMN     "supplier_bill_id" UUID;

-- CreateTable
CREATE TABLE "supplier_bills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bill_number" TEXT NOT NULL,
    "supplier_name" TEXT,
    "invoice_number" TEXT,
    "bill_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(12,2) NOT NULL,
    "status" "SupplierBillStatus" NOT NULL DEFAULT 'UNPAID',
    "payment_method" "PaymentMethod",
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "supplier_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_number" TEXT NOT NULL,
    "supplier_bill_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "payment_date" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "paid_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_bills_bill_number_key" ON "supplier_bills"("bill_number");

-- CreateIndex
CREATE INDEX "supplier_bills_status_bill_date_idx" ON "supplier_bills"("status", "bill_date");

-- CreateIndex
CREATE INDEX "supplier_bills_supplier_name_idx" ON "supplier_bills"("supplier_name");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_payments_payment_number_key" ON "supplier_payments"("payment_number");

-- CreateIndex
CREATE INDEX "supplier_payments_supplier_bill_id_idx" ON "supplier_payments"("supplier_bill_id");

-- CreateIndex
CREATE INDEX "supplier_payments_payment_date_idx" ON "supplier_payments"("payment_date");

-- CreateIndex
CREATE INDEX "expenses_supplier_bill_id_idx" ON "expenses"("supplier_bill_id");

-- CreateIndex
CREATE INDEX "raw_material_intake_supplier_bill_id_idx" ON "raw_material_intake"("supplier_bill_id");

-- AddForeignKey
ALTER TABLE "raw_material_intake" ADD CONSTRAINT "raw_material_intake_supplier_bill_id_fkey" FOREIGN KEY ("supplier_bill_id") REFERENCES "supplier_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_supplier_bill_id_fkey" FOREIGN KEY ("supplier_bill_id") REFERENCES "supplier_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_bill_id_fkey" FOREIGN KEY ("supplier_bill_id") REFERENCES "supplier_bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
