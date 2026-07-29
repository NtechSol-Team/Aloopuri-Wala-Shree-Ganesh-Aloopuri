-- AlterTable
ALTER TABLE "raw_materials" ADD COLUMN     "hsn_code" TEXT,
ADD COLUMN     "tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 0;
