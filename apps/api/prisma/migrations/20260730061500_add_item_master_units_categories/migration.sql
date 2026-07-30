-- Item Master: dynamic Unit master (with per-unit decimal precision) replacing the
-- fixed MeasurementUnit enum, plus a type on product categories so the same category
-- master serves both finished goods and raw materials.
--
-- Hand-authored because steps 4/6 (seed + backfill) can't be expressed declaratively:
-- every existing product/raw material/menu item must land on the Unit row matching
-- the enum value it currently holds before the old column can be dropped.

-- 1. Category type -----------------------------------------------------------
CREATE TYPE "CategoryType" AS ENUM ('FINISHED_GOODS', 'RAW_MATERIAL');

ALTER TABLE "product_categories"
  ADD COLUMN "type" "CategoryType" NOT NULL DEFAULT 'FINISHED_GOODS';

-- 2. Unit master -------------------------------------------------------------
CREATE TABLE "units" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "name"           TEXT         NOT NULL,
  "decimal_places" INTEGER      NOT NULL DEFAULT 2,
  "is_active"      BOOLEAN      NOT NULL DEFAULT true,
  "is_deleted"     BOOLEAN      NOT NULL DEFAULT false,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"     TIMESTAMPTZ(6) NOT NULL,
  "created_by"     UUID,

  CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "units_name_key" ON "units"("name");

-- 3. Seed one Unit per legacy enum value. Decimal places reflect how each unit is
-- actually counted in this business: discrete units are whole numbers, weight/volume
-- units that get part-measured allow fractions.
INSERT INTO "units" ("name", "decimal_places", "updated_at") VALUES
  ('Kg',     3, CURRENT_TIMESTAMP),
  ('Gram',   0, CURRENT_TIMESTAMP),
  ('Litre',  3, CURRENT_TIMESTAMP),
  ('ML',     0, CURRENT_TIMESTAMP),
  ('Piece',  0, CURRENT_TIMESTAMP),
  ('Packet', 0, CURRENT_TIMESTAMP),
  ('Box',    0, CURRENT_TIMESTAMP),
  ('Dozen',  0, CURRENT_TIMESTAMP);

-- 4. Add the new columns as nullable so existing rows survive the backfill.
ALTER TABLE "products"      ADD COLUMN "unit_id" UUID;
ALTER TABLE "raw_materials" ADD COLUMN "unit_id" UUID;
ALTER TABLE "raw_materials" ADD COLUMN "category_id" UUID;
ALTER TABLE "menu_items"    ADD COLUMN "unit_id" UUID;

-- 5. Backfill from the legacy enum. The CASE maps each enum label to its seeded
-- unit name; anything unmapped would be left NULL and caught by step 7's NOT NULL.
UPDATE "products" p SET "unit_id" = u."id"
  FROM "units" u
  WHERE u."name" = CASE p."unit"::text
    WHEN 'KG' THEN 'Kg'      WHEN 'GRAM'   THEN 'Gram'
    WHEN 'LITRE' THEN 'Litre' WHEN 'ML'    THEN 'ML'
    WHEN 'PIECE' THEN 'Piece' WHEN 'PACKET' THEN 'Packet'
    WHEN 'BOX' THEN 'Box'     WHEN 'DOZEN' THEN 'Dozen'
  END;

UPDATE "raw_materials" r SET "unit_id" = u."id"
  FROM "units" u
  WHERE u."name" = CASE r."unit"::text
    WHEN 'KG' THEN 'Kg'      WHEN 'GRAM'   THEN 'Gram'
    WHEN 'LITRE' THEN 'Litre' WHEN 'ML'    THEN 'ML'
    WHEN 'PIECE' THEN 'Piece' WHEN 'PACKET' THEN 'Packet'
    WHEN 'BOX' THEN 'Box'     WHEN 'DOZEN' THEN 'Dozen'
  END;

UPDATE "menu_items" m SET "unit_id" = u."id"
  FROM "units" u
  WHERE u."name" = CASE m."unit"::text
    WHEN 'KG' THEN 'Kg'      WHEN 'GRAM'   THEN 'Gram'
    WHEN 'LITRE' THEN 'Litre' WHEN 'ML'    THEN 'ML'
    WHEN 'PIECE' THEN 'Piece' WHEN 'PACKET' THEN 'Packet'
    WHEN 'BOX' THEN 'Box'     WHEN 'DOZEN' THEN 'Dozen'
  END;

-- 6. Widen every quantity column to 4 decimals so a unit configured for up to 4
-- decimal places can actually be stored. Lossless: existing values carry <= 2.
ALTER TABLE "products"           ALTER COLUMN "reorder_level"      SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "raw_materials"      ALTER COLUMN "reorder_level"      SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "raw_materials"      ALTER COLUMN "current_stock"      SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "production_batches" ALTER COLUMN "quantity_produced"  SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "raw_material_intake" ALTER COLUMN "quantity"          SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "godown_stock"       ALTER COLUMN "quantity"           SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "main_branch_stock"  ALTER COLUMN "quantity"           SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "outlet_stock"       ALTER COLUMN "quantity"           SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "stock_transfer_items" ALTER COLUMN "quantity"         SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "outlet_order_items" ALTER COLUMN "requested_quantity" SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "outlet_order_items" ALTER COLUMN "confirmed_quantity" SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "bill_items"         ALTER COLUMN "quantity"           SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "pos_transaction_items" ALTER COLUMN "quantity"        SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "supplier_bill_items" ALTER COLUMN "quantity"          SET DATA TYPE DECIMAL(12,4);

-- 7. Lock in the relation now that every row is backfilled.
ALTER TABLE "products"      ALTER COLUMN "unit_id" SET NOT NULL;
ALTER TABLE "raw_materials" ALTER COLUMN "unit_id" SET NOT NULL;
ALTER TABLE "menu_items"    ALTER COLUMN "unit_id" SET NOT NULL;

CREATE INDEX "products_unit_id_idx"         ON "products"("unit_id");
CREATE INDEX "raw_materials_unit_id_idx"    ON "raw_materials"("unit_id");
CREATE INDEX "raw_materials_category_id_idx" ON "raw_materials"("category_id");
CREATE INDEX "menu_items_unit_id_idx"       ON "menu_items"("unit_id");

ALTER TABLE "products" ADD CONSTRAINT "products_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "raw_materials" ADD CONSTRAINT "raw_materials_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 8. Retire the legacy enum.
ALTER TABLE "products"      DROP COLUMN "unit";
ALTER TABLE "raw_materials" DROP COLUMN "unit";
ALTER TABLE "menu_items"    DROP COLUMN "unit";

DROP TYPE "MeasurementUnit";
