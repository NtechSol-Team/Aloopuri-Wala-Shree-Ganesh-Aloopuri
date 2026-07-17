-- Dine In / Parcel (takeaway) flag on POS sales. Existing rows all predate this
-- feature and were, in effect, dine-in — DINE_IN is a safe, correct default,
-- not a guess.

-- CreateEnum
CREATE TYPE "PosOrderType" AS ENUM ('DINE_IN', 'PARCEL');

-- AlterTable
ALTER TABLE "pos_transactions" ADD COLUMN     "order_type" "PosOrderType" NOT NULL DEFAULT 'DINE_IN';
