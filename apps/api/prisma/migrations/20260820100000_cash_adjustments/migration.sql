-- Manual corrections to cash-in-hand: the Cash Book's opening balance, and any
-- later correction after a physical count found a shortage/surplus.

-- CreateTable
CREATE TABLE "cash_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "amount" DECIMAL(12,2) NOT NULL,
    "adjustment_date" TIMESTAMPTZ(6) NOT NULL,
    "reason" TEXT NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "cash_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_adjustments_adjustment_date_idx" ON "cash_adjustments"("adjustment_date");
