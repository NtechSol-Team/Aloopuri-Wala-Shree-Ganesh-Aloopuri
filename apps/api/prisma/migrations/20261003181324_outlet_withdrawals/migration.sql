-- Outlet ledger becomes month-by-month: each month starts at zero, so the
-- carry-forward opening balance goes, and the owner's withdrawals from a
-- month's profit are recorded instead. Still nothing to do with company
-- accounting.

-- DropTable
DROP TABLE "outlet_opening_balances";

-- CreateTable
CREATE TABLE "outlet_withdrawals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "outlet_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "withdraw_date" TIMESTAMPTZ(6) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_method" "OutletExpensePaymentMethod" NOT NULL,
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "outlet_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outlet_withdrawals_outlet_id_year_month_idx" ON "outlet_withdrawals"("outlet_id", "year", "month");
