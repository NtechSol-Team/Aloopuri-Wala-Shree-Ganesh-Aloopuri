-- Price-change trail for finished-goods products: one row at creation, then one
-- more every time basePrice or mrp is edited, so the Item Master can show when a
-- product's price last moved and what it moved from/to.

-- CreateTable
CREATE TABLE "product_price_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "base_price" DECIMAL(12,2) NOT NULL,
    "mrp" DECIMAL(12,2) NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_price_history_product_id_changed_at_idx" ON "product_price_history"("product_id", "changed_at");
