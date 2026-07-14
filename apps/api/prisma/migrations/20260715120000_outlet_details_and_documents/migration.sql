

-- CreateEnum
CREATE TYPE "OutletDocumentCategory" AS ENUM ('GST_CERTIFICATE', 'FSSAI_LICENSE', 'PAN_CARD', 'AGREEMENT', 'RENT_DEED', 'OTHER');

-- AlterTable
ALTER TABLE "outlets" ADD COLUMN     "email" TEXT,
ADD COLUMN     "fssai_number" TEXT,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "legal_name" TEXT,
ADD COLUMN     "receipt_footer" TEXT;

-- CreateTable
CREATE TABLE "outlet_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "category" "OutletDocumentCategory" NOT NULL DEFAULT 'OTHER',
    "file_name" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "notes" TEXT,
    "uploaded_by" UUID,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outlet_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outlet_documents_outlet_id_idx" ON "outlet_documents"("outlet_id");

-- AddForeignKey
ALTER TABLE "outlet_documents" ADD CONSTRAINT "outlet_documents_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

