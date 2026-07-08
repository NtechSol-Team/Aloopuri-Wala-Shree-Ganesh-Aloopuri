-- CreateEnum
CREATE TYPE "BomComponentType" AS ENUM ('RAW_MATERIAL', 'PRODUCT');

-- DropForeignKey
ALTER TABLE "bill_of_materials" DROP CONSTRAINT "bill_of_materials_raw_material_id_fkey";

-- DropForeignKey
ALTER TABLE "production_batch_items" DROP CONSTRAINT "production_batch_items_raw_material_id_fkey";

-- DropIndex
DROP INDEX "bill_of_materials_product_id_raw_material_id_key";

-- AlterTable
ALTER TABLE "bill_of_materials" ADD COLUMN     "component_product_id" UUID,
ADD COLUMN     "component_type" "BomComponentType" NOT NULL DEFAULT 'RAW_MATERIAL',
ALTER COLUMN "raw_material_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "production_batch_items" ADD COLUMN     "component_product_id" UUID,
ADD COLUMN     "component_type" "BomComponentType" NOT NULL DEFAULT 'RAW_MATERIAL',
ADD COLUMN     "name_snapshot" TEXT,
ALTER COLUMN "raw_material_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "production_batches" ADD COLUMN     "cost_per_unit" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "overhead_cost" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "avg_cost" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "production_overheads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_overheads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_overheads_batch_id_idx" ON "production_overheads"("batch_id");

-- CreateIndex
CREATE INDEX "bill_of_materials_component_product_id_idx" ON "bill_of_materials"("component_product_id");

-- CreateIndex
CREATE INDEX "production_batch_items_component_product_id_idx" ON "production_batch_items"("component_product_id");

-- AddForeignKey
ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_of_materials" ADD CONSTRAINT "bill_of_materials_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batch_items" ADD CONSTRAINT "production_batch_items_raw_material_id_fkey" FOREIGN KEY ("raw_material_id") REFERENCES "raw_materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_batch_items" ADD CONSTRAINT "production_batch_items_component_product_id_fkey" FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_overheads" ADD CONSTRAINT "production_overheads_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "production_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
