-- Receive Payment (FIFO across an outlet's outstanding bills).
--
-- A single receipt can now cover several bills at once, oldest first, so one
-- payment needs a way to point at many bills instead of the one `bill_id` FK
-- already on `payments`. `payment_allocations` carries that split; `bill_id`
-- on `payments` stays as-is (and keeps being set directly) for the common case
-- of a receipt that only ever touches one bill, so every existing reader that
-- joins payments -> bills via bill_id is untouched.

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'CHEQUE';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "advance_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payments" ADD COLUMN "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_bill_id_key" ON "payment_allocations"("payment_id", "bill_id");

-- CreateIndex
CREATE INDEX "payment_allocations_bill_id_idx" ON "payment_allocations"("bill_id");

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
