-- CreateEnum
CREATE TYPE "DeveloperExpenseCategory" AS ENUM ('DROPLET', 'DATABASE', 'AI', 'DOMAIN', 'OTHER');

-- CreateTable
CREATE TABLE "developer_expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category" "DeveloperExpenseCategory" NOT NULL,
    "label" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "incurred_on" TIMESTAMPTZ(6) NOT NULL,
    "ended_on" TIMESTAMPTZ(6),
    "notes" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "developer_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "developer_expenses_category_idx" ON "developer_expenses"("category");

-- CreateIndex
CREATE INDEX "developer_expenses_incurred_on_idx" ON "developer_expenses"("incurred_on");
