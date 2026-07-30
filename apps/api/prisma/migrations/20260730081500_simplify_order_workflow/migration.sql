-- Simplify the outlet-order workflow to: placed (CONFIRMED) → Fulfil → DELIVERED,
-- with "pending payment" derived from the bill rather than being a status.
--
-- Retires PAYMENT_PENDING, CREDIT_APPROVAL_PENDING and DISPATCHED. Hand-authored
-- because existing rows in those states have to be moved onto the new flow — and a
-- DISPATCHED order has stock that already left its source but never reached the
-- outlet, which must be landed before the status is collapsed or that stock is lost.

-- 1. Advance payments: money can now be taken for an order before its bill exists.
ALTER TABLE "payments" ADD COLUMN "order_id" UUID;
CREATE INDEX "payments_order_id_idx" ON "payments"("order_id");
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "outlet_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Orders that were waiting on payment or credit approval simply await fulfilment
-- now. Anything already paid for keeps its bill and payment rows untouched.
UPDATE "outlet_orders"
   SET "status" = 'CONFIRMED',
       "confirmed_at" = COALESCE("confirmed_at", now())
 WHERE "status" IN ('PAYMENT_PENDING', 'CREDIT_APPROVAL_PENDING');

-- 3. Land the stock of any in-flight DISPATCHED order at its outlet. Under the old
-- flow stock left the source at dispatch and arrived only when the outlet confirmed
-- receipt; Fulfil now does both at once, so these orders need their arrival applied.
INSERT INTO "outlet_stock" ("outlet_id", "product_id", "quantity", "updated_at")
SELECT o."outlet_id",
       i."product_id",
       SUM(COALESCE(i."confirmed_quantity", i."requested_quantity")),
       now()
  FROM "outlet_orders" o
  JOIN "outlet_order_items" i ON i."order_id" = o."id" AND i."is_deleted" = false
 WHERE o."is_deleted" = false AND o."status" = 'DISPATCHED'
 GROUP BY o."outlet_id", i."product_id"
ON CONFLICT ("outlet_id", "product_id")
DO UPDATE SET "quantity" = "outlet_stock"."quantity" + EXCLUDED."quantity",
              "updated_at" = now();

UPDATE "outlet_orders"
   SET "status" = 'DELIVERED',
       "delivered_at" = COALESCE("delivered_at", now())
 WHERE "status" = 'DISPATCHED';

-- 4. Rebuild the enum without the retired values. The column default references the
-- old type, so it has to be dropped first and re-set afterwards.
ALTER TABLE "outlet_orders" ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "OutletOrderStatus" RENAME TO "OutletOrderStatus_old";
CREATE TYPE "OutletOrderStatus" AS ENUM ('CONFIRMED', 'DELIVERED', 'CANCELLED');

ALTER TABLE "outlet_orders"
  ALTER COLUMN "status" TYPE "OutletOrderStatus"
  USING ("status"::text::"OutletOrderStatus");

ALTER TABLE "outlet_orders" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';

DROP TYPE "OutletOrderStatus_old";
