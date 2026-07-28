-- CreateTable
CREATE TABLE "user_activity_intervals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6) NOT NULL,
    "active_seconds" INTEGER NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_activity_intervals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_metric_samples" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "load_avg_1" DOUBLE PRECISION NOT NULL,
    "load_avg_5" DOUBLE PRECISION NOT NULL,
    "load_avg_15" DOUBLE PRECISION NOT NULL,
    "mem_used_pct" DOUBLE PRECISION NOT NULL,
    "net_rx_bytes_total" BIGINT,
    "net_tx_bytes_total" BIGINT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_metric_samples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_activity_intervals_user_id_started_at_idx" ON "user_activity_intervals"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "user_activity_intervals_started_at_idx" ON "user_activity_intervals"("started_at");

-- CreateIndex
CREATE INDEX "server_metric_samples_created_at_idx" ON "server_metric_samples"("created_at");

-- AddForeignKey
ALTER TABLE "user_activity_intervals" ADD CONSTRAINT "user_activity_intervals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
