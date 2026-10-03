-- The main owner's private per-outlet expense ledger and opening balance. Kept in
-- their own tables so nothing in company accounting (Day Book, Cash Book, P&L,
-- expenses) ever picks them up.

-- CreateEnum
CREATE TYPE "OutletExpensePaymentMethod" AS ENUM ('CASH', 'ONLINE', 'CHEQUE', 'BANK');

-- CreateEnum
CREATE TYPE "OutletExpenseLocation" AS ENUM ('SHOP', 'GODOWN');

-- CreateTable
CREATE TABLE "outlet_expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "expense_date" TIMESTAMPTZ(6) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" "OutletExpensePaymentMethod" NOT NULL,
    "location" "OutletExpenseLocation" NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "outlet_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outlet_opening_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "as_of_date" TIMESTAMPTZ(6) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "outlet_opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outlet_expenses_outlet_id_expense_date_idx" ON "outlet_expenses"("outlet_id", "expense_date");

-- CreateIndex
CREATE UNIQUE INDEX "outlet_opening_balances_outlet_id_key" ON "outlet_opening_balances"("outlet_id");
