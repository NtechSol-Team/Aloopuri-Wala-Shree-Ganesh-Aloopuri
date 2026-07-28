-- CreateEnum
CREATE TYPE "DeveloperPaymentScope" AS ENUM ('MAIN_ADMIN', 'OUTLET');

-- CreateTable
CREATE TABLE "developer_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" "DeveloperPaymentScope" NOT NULL,
    "outlet_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" "PaymentMethod",
    "paid_on" TIMESTAMPTZ(6) NOT NULL,
    "renewal_date" TIMESTAMPTZ(6) NOT NULL,
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "developer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "developer_payments_scope_outlet_id_idx" ON "developer_payments"("scope", "outlet_id");

-- CreateIndex
CREATE INDEX "developer_payments_renewal_date_idx" ON "developer_payments"("renewal_date");
