-- Rename "customers" into a generic "contacts" master (Customer / Supplier / Other),
-- preserving existing rows, and add WhatsApp + bank detail fields.

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('CUSTOMER', 'SUPPLIER', 'OTHER');

-- RenameTable (preserves data, PK, and existing indexes/constraints)
ALTER TABLE "customers" RENAME TO "contacts";
ALTER TABLE "contacts" RENAME CONSTRAINT "customers_pkey" TO "contacts_pkey";
ALTER INDEX "customers_gstin_idx" RENAME TO "contacts_gstin_idx";
ALTER INDEX "customers_name_idx" RENAME TO "contacts_name_idx";

-- AlterTable: new optional columns
ALTER TABLE "contacts"
  ADD COLUMN "type" "ContactType" NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN "whatsapp" TEXT,
  ADD COLUMN "bank_account_holder" TEXT,
  ADD COLUMN "bank_name" TEXT,
  ADD COLUMN "bank_account_number" TEXT,
  ADD COLUMN "bank_ifsc" TEXT;

-- CreateIndex
CREATE INDEX "contacts_type_idx" ON "contacts"("type");
