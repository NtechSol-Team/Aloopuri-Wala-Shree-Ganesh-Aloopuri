-- CreateEnum
CREATE TYPE "PricingMode" AS ENUM ('GENERIC', 'SPECIAL');

-- AlterTable
ALTER TABLE "bills" ADD COLUMN     "is_gst_bill" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "outlet_orders" ADD COLUMN     "is_gst_bill" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "outlets" ADD COLUMN     "pricing_mode" "PricingMode" NOT NULL DEFAULT 'GENERIC';

-- AlterTable
ALTER TABLE "supplier_bills" ADD COLUMN     "is_gst_bill" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "outlet_product_prices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outlet_product_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outlet_product_prices_outlet_id_idx" ON "outlet_product_prices"("outlet_id");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_product_prices_outlet_id_product_id_key" ON "outlet_product_prices"("outlet_id", "product_id");

-- AddForeignKey
ALTER TABLE "outlet_product_prices" ADD CONSTRAINT "outlet_product_prices_outlet_id_fkey" FOREIGN KEY ("outlet_id") REFERENCES "outlets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outlet_product_prices" ADD CONSTRAINT "outlet_product_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
