-- CreateEnum
CREATE TYPE "TransferDestination" AS ENUM ('MAIN_BRANCH', 'OUTLET');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "hsn_code" TEXT,
ADD COLUMN     "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "raw_material_intake" ADD COLUMN     "hsn_code" TEXT,
ADD COLUMN     "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "tax_rate" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "stock_transfers" ADD COLUMN     "destination_outlet_id" UUID,
ADD COLUMN     "destination_type" "TransferDestination" NOT NULL DEFAULT 'MAIN_BRANCH';

-- AlterTable
ALTER TABLE "supplier_bills" ADD COLUMN     "cgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "igst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sgst" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "supplier_gstin" TEXT,
ADD COLUMN     "tax_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxable_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "gstin" TEXT,
    "legal_name" TEXT,
    "trade_name" TEXT,
    "state_code" TEXT,
    "state_name" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_gstin_idx" ON "customers"("gstin");

-- CreateIndex
CREATE INDEX "customers_name_idx" ON "customers" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "stock_transfers_destination_outlet_id_idx" ON "stock_transfers"("destination_outlet_id");

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_destination_outlet_id_fkey" FOREIGN KEY ("destination_outlet_id") REFERENCES "outlets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
