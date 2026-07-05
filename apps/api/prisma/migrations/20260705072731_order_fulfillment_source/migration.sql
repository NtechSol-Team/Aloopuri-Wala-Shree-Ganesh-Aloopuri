-- CreateEnum
CREATE TYPE "FulfillmentSource" AS ENUM ('MAIN_BRANCH', 'GODOWN');

-- AlterTable
ALTER TABLE "outlet_orders" ADD COLUMN     "fulfillment_source" "FulfillmentSource";
