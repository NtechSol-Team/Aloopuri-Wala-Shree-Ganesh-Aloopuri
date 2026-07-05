-- CreateEnum
CREATE TYPE "KotStatus" AS ENUM ('PREPARING', 'READY', 'DELIVERED');

-- AlterTable
ALTER TABLE "pos_transactions" ADD COLUMN     "kot_status" "KotStatus" NOT NULL DEFAULT 'PREPARING',
ADD COLUMN     "token_number" INTEGER;

-- CreateIndex
CREATE INDEX "pos_transactions_outlet_id_kot_status_idx" ON "pos_transactions"("outlet_id", "kot_status");
