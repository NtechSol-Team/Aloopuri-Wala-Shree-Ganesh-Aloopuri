-- Outlet orders now require payment (online) or credit approval before they are
-- confirmed. Reshapes OutletOrderStatus, adds the payment/approval trail, and
-- gives each outlet a GST-billing preference (their orders are priced — and paid
-- for — before anyone reviews them, so GST has to be known upfront).

-- CreateEnum
CREATE TYPE "OrderPaymentMode" AS ENUM ('ONLINE', 'CREDIT');

-- AlterEnum: PENDING splits into PAYMENT_PENDING / CREDIT_APPROVAL_PENDING.
-- Existing PENDING orders were awaiting the main owner's review, which is exactly
-- what CREDIT_APPROVAL_PENDING now means — so they carry over there and stay
-- actionable (approve/reject) instead of being stranded in a dropped status.
BEGIN;
CREATE TYPE "OutletOrderStatus_new" AS ENUM ('PAYMENT_PENDING', 'CREDIT_APPROVAL_PENDING', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED');
ALTER TABLE "outlet_orders" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "outlet_orders" ALTER COLUMN "status" TYPE "OutletOrderStatus_new"
  USING (
    CASE "status"::text
      WHEN 'PENDING' THEN 'CREDIT_APPROVAL_PENDING'
      ELSE "status"::text
    END
  )::"OutletOrderStatus_new";
ALTER TYPE "OutletOrderStatus" RENAME TO "OutletOrderStatus_old";
ALTER TYPE "OutletOrderStatus_new" RENAME TO "OutletOrderStatus";
DROP TYPE "OutletOrderStatus_old";
ALTER TABLE "outlet_orders" ALTER COLUMN "status" SET DEFAULT 'PAYMENT_PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "outlet_orders" ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "approved_by" UUID,
ADD COLUMN     "cancellation_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN     "cancelled_by" UUID,
ADD COLUMN     "payment_mode" "OrderPaymentMode",
ADD COLUMN     "razorpay_order_id" TEXT;

-- Orders that existed before this feature were implicitly credit orders.
UPDATE "outlet_orders" SET "payment_mode" = 'CREDIT' WHERE "payment_mode" IS NULL;

-- AlterTable
ALTER TABLE "outlets" ADD COLUMN     "gst_billing" BOOLEAN NOT NULL DEFAULT true;
