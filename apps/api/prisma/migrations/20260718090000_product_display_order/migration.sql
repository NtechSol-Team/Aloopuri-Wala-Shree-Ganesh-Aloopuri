-- Manual POS grid sort position (lower = earlier). Additive, safe: existing
-- rows default to 0 and are then backfilled to their menu order by a data step.

-- AlterTable
ALTER TABLE "products" ADD COLUMN "display_order" INTEGER NOT NULL DEFAULT 0;
