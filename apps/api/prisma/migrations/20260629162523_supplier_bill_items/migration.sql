-- CreateEnum
CREATE TYPE "PurchaseLineKind" AS ENUM ('RAW_MATERIAL', 'FINISHED_GOOD', 'OTHER');

-- CreateTable
CREATE TABLE "supplier_bill_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_bill_id" UUID NOT NULL,
    "kind" "PurchaseLineKind" NOT NULL,
    "ref_id" UUID,
    "name" TEXT NOT NULL,
    "hsn_code" TEXT,
    "quantity" DECIMAL(12,2),
    "unit_cost" DECIMAL(12,2),
    "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "taxable_amount" DECIMAL(12,2) NOT NULL,
    "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(12,2) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_bill_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_bill_items_supplier_bill_id_idx" ON "supplier_bill_items"("supplier_bill_id");

-- AddForeignKey
ALTER TABLE "supplier_bill_items" ADD CONSTRAINT "supplier_bill_items_supplier_bill_id_fkey" FOREIGN KEY ("supplier_bill_id") REFERENCES "supplier_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
