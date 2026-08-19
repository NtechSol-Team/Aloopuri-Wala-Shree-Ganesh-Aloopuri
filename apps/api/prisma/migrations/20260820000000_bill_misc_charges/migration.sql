-- Packing, transport and similar dispatch costs the main owner adds when raising
-- a bill. Kept separate from sub_total/tax_total so per-item GST math is
-- untouched, but summed into grand_total so the outlet's balance reflects them.

-- AlterTable
ALTER TABLE "bills" ADD COLUMN "other_charges_total" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "bill_charges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bill_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_charges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bill_charges_bill_id_idx" ON "bill_charges"("bill_id");

-- AddForeignKey
ALTER TABLE "bill_charges" ADD CONSTRAINT "bill_charges_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
