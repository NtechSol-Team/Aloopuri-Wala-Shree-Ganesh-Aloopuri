-- DropForeignKey
ALTER TABLE "pos_transaction_items" DROP CONSTRAINT "pos_transaction_items_product_id_fkey";

-- AlterTable
ALTER TABLE "outlets" ADD COLUMN     "assigned_menu_id" UUID;

-- AlterTable
ALTER TABLE "pos_transaction_items" ADD COLUMN     "menu_item_id" UUID,
ALTER COLUMN "product_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "menus" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "menu_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "menu_id" UUID NOT NULL,
    "category_id" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "unit" "MeasurementUnit" NOT NULL DEFAULT 'PIECE',
    "price" DECIMAL(12,2) NOT NULL,
    "tax_percent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "photo_url" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menus_is_deleted_idx" ON "menus"("is_deleted");

-- CreateIndex
CREATE INDEX "menu_categories_menu_id_idx" ON "menu_categories"("menu_id");

-- CreateIndex
CREATE INDEX "menu_items_menu_id_idx" ON "menu_items"("menu_id");

-- CreateIndex
CREATE INDEX "menu_items_category_id_idx" ON "menu_items"("category_id");

-- CreateIndex
CREATE INDEX "menu_items_is_deleted_idx" ON "menu_items"("is_deleted");

-- CreateIndex
CREATE INDEX "outlets_assigned_menu_id_idx" ON "outlets"("assigned_menu_id");

-- CreateIndex
CREATE INDEX "pos_transaction_items_menu_item_id_idx" ON "pos_transaction_items"("menu_item_id");

-- AddForeignKey
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_assigned_menu_id_fkey" FOREIGN KEY ("assigned_menu_id") REFERENCES "menus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_transaction_items" ADD CONSTRAINT "pos_transaction_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_transaction_items" ADD CONSTRAINT "pos_transaction_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- DATA BACKFILL (runs once, atomically with the schema change).
--
-- Snapshot today's single shared POS menu into a default "Main Menu": one
-- MenuCategory per distinct category used by a POS-enabled product, one MenuItem
-- per POS-enabled product (copying name, price=mrp, tax, photo, order, unit).
-- Then point every existing outlet at it. Result: the counter looks identical
-- until the Main Owner deliberately edits or reassigns a menu.
-- ─────────────────────────────────────────────────────────────────────────────
WITH new_menu AS (
  INSERT INTO "menus" ("name", "description", "is_default", "is_active", "updated_at")
  VALUES ('Main Menu', 'Auto-created from the existing shared POS menu.', true, true, CURRENT_TIMESTAMP)
  RETURNING "id"
),
src_cats AS (
  SELECT DISTINCT pc."name"
  FROM "products" p
  JOIN "product_categories" pc ON pc."id" = p."category_id"
  WHERE p."is_deleted" = false AND p."is_active" = true AND p."is_pos_enabled" = true
),
new_cats AS (
  INSERT INTO "menu_categories" ("menu_id", "name", "display_order", "updated_at")
  SELECT (SELECT "id" FROM new_menu), sc."name",
         (ROW_NUMBER() OVER (ORDER BY sc."name"))::int - 1, CURRENT_TIMESTAMP
  FROM src_cats sc
  RETURNING "id", "name"
)
INSERT INTO "menu_items"
  ("menu_id", "category_id", "name", "code", "unit", "price", "tax_percent", "photo_url", "display_order", "is_available", "updated_at")
SELECT
  (SELECT "id" FROM new_menu),
  nc."id",
  p."name",
  p."sku",
  p."unit",
  p."mrp",
  p."tax_percent",
  p."photo_url",
  p."display_order",
  p."is_active",
  CURRENT_TIMESTAMP
FROM "products" p
JOIN "product_categories" pc ON pc."id" = p."category_id"
JOIN new_cats nc ON nc."name" = pc."name"
WHERE p."is_deleted" = false AND p."is_active" = true AND p."is_pos_enabled" = true;

-- Assign every existing (non-deleted) outlet to the new default menu.
UPDATE "outlets"
SET "assigned_menu_id" = (SELECT "id" FROM "menus" WHERE "is_default" = true ORDER BY "created_at" ASC LIMIT 1)
WHERE "is_deleted" = false;
