-- ─────────────────────────────────────────────────────────────────────────────
-- Audit triggers + analytics materialized views.
--
-- These object types (functions, triggers, materialized views) are NOT modelled
-- by Prisma, so they do not cause schema drift. They are applied via
-- `prisma migrate deploy` alongside the generated migrations.
--
-- ROLLBACK (manual):
--   DROP MATERIALIZED VIEW IF EXISTS mv_monthly_pl, mv_outlet_sales;
--   DROP FUNCTION IF EXISTS refresh_analytics_views();
--   DROP TRIGGER IF EXISTS trg_bill_audit ON bills; (etc.)
--   DROP FUNCTION IF EXISTS fn_record_audit();
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Generic shadow-audit trigger ─────────────────────────────────────────────
-- Records INSERT/UPDATE/DELETE on critical financial tables into the matching
-- *_audit table. The acting user is read from the transaction-local GUC
-- `app.user_id` (set by the API via withAuditUser()); NULL when unset.
CREATE OR REPLACE FUNCTION fn_record_audit() RETURNS trigger AS $$
DECLARE
  v_audit_table text := TG_ARGV[0];
  v_ref_col     text := TG_ARGV[1];
  v_ref_id      uuid;
  v_actor_txt   text;
  v_actor       uuid;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_ref_id := OLD.id;
  ELSE
    v_ref_id := NEW.id;
  END IF;

  v_actor_txt := current_setting('app.user_id', true);
  IF v_actor_txt IS NULL OR v_actor_txt = '' THEN
    v_actor := NULL;
  ELSE
    BEGIN
      v_actor := v_actor_txt::uuid;
    EXCEPTION WHEN others THEN
      v_actor := NULL;
    END;
  END IF;

  EXECUTE format(
    'INSERT INTO %I (%I, action, old_value, new_value, changed_by) VALUES ($1, $2::"AuditAction", $3, $4, $5)',
    v_audit_table, v_ref_col
  )
  USING
    v_ref_id,
    TG_OP,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    v_actor;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bill_audit ON bills;
CREATE TRIGGER trg_bill_audit
  AFTER INSERT OR UPDATE OR DELETE ON bills
  FOR EACH ROW EXECUTE FUNCTION fn_record_audit('bill_audit', 'bill_id');

DROP TRIGGER IF EXISTS trg_payment_audit ON payments;
CREATE TRIGGER trg_payment_audit
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION fn_record_audit('payment_audit', 'payment_id');

DROP TRIGGER IF EXISTS trg_stock_transfer_audit ON stock_transfers;
CREATE TRIGGER trg_stock_transfer_audit
  AFTER INSERT OR UPDATE OR DELETE ON stock_transfers
  FOR EACH ROW EXECUTE FUNCTION fn_record_audit('stock_transfer_audit', 'transfer_id');

DROP TRIGGER IF EXISTS trg_production_batch_audit ON production_batches;
CREATE TRIGGER trg_production_batch_audit
  AFTER INSERT OR UPDATE OR DELETE ON production_batches
  FOR EACH ROW EXECUTE FUNCTION fn_record_audit('production_batch_audit', 'batch_id');

-- ── Materialized view: monthly P&L (last 12 months) ──────────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_monthly_pl;
CREATE MATERIALIZED VIEW mv_monthly_pl AS
WITH months AS (
  SELECT date_trunc('month', d)::date AS month
  FROM generate_series(
    date_trunc('month', now()) - interval '11 months',
    date_trunc('month', now()),
    interval '1 month'
  ) d
),
pos AS (
  SELECT date_trunc('month', sold_at)::date AS month, COALESCE(SUM(grand_total), 0) AS pos_revenue
  FROM pos_transactions
  WHERE status = 'COMPLETED' AND is_deleted = false
  GROUP BY 1
),
billing AS (
  SELECT date_trunc('month', bill_date)::date AS month, COALESCE(SUM(grand_total), 0) AS billing_revenue
  FROM bills
  WHERE is_deleted = false AND status <> 'CANCELLED'
  GROUP BY 1
),
cogs AS (
  SELECT date_trunc('month', production_date)::date AS month, COALESCE(SUM(total_material_cost), 0) AS cogs
  FROM production_batches
  WHERE is_deleted = false
  GROUP BY 1
),
exp AS (
  SELECT date_trunc('month', expense_date)::date AS month, COALESCE(SUM(amount), 0) AS expenses
  FROM expenses
  WHERE is_deleted = false
  GROUP BY 1
)
SELECT
  m.month,
  COALESCE(pos.pos_revenue, 0)                                        AS pos_revenue,
  COALESCE(billing.billing_revenue, 0)                               AS billing_revenue,
  COALESCE(pos.pos_revenue, 0) + COALESCE(billing.billing_revenue, 0) AS total_revenue,
  COALESCE(cogs.cogs, 0)                                              AS cogs,
  COALESCE(exp.expenses, 0)                                          AS expenses,
  (COALESCE(pos.pos_revenue, 0) + COALESCE(billing.billing_revenue, 0)) - COALESCE(cogs.cogs, 0) AS gross_profit,
  (COALESCE(pos.pos_revenue, 0) + COALESCE(billing.billing_revenue, 0)) - COALESCE(cogs.cogs, 0) - COALESCE(exp.expenses, 0) AS net_profit
FROM months m
LEFT JOIN pos     ON pos.month = m.month
LEFT JOIN billing ON billing.month = m.month
LEFT JOIN cogs    ON cogs.month = m.month
LEFT JOIN exp     ON exp.month = m.month
ORDER BY m.month;

CREATE UNIQUE INDEX idx_mv_monthly_pl_month ON mv_monthly_pl (month);

-- ── Materialized view: outlet sales / receivables summary ────────────────────
DROP MATERIALIZED VIEW IF EXISTS mv_outlet_sales;
CREATE MATERIALIZED VIEW mv_outlet_sales AS
SELECT
  o.id                              AS outlet_id,
  o.name                            AS outlet_name,
  COALESCE(ord.total_orders, 0)     AS total_orders,
  ord.last_order_date               AS last_order_date,
  COALESCE(bl.total_billed, 0)      AS total_billed,
  COALESCE(bl.total_paid, 0)        AS total_paid,
  COALESCE(bl.outstanding, 0)       AS outstanding
FROM outlets o
LEFT JOIN (
  SELECT outlet_id, COUNT(*) AS total_orders, MAX(order_date) AS last_order_date
  FROM outlet_orders
  WHERE is_deleted = false
  GROUP BY outlet_id
) ord ON ord.outlet_id = o.id
LEFT JOIN (
  SELECT outlet_id,
         SUM(grand_total)                                          AS total_billed,
         SUM(amount_paid)                                          AS total_paid,
         SUM(CASE WHEN status <> 'PAID' THEN balance_due ELSE 0 END) AS outstanding
  FROM bills
  WHERE is_deleted = false AND status <> 'CANCELLED'
  GROUP BY outlet_id
) bl ON bl.outlet_id = o.id
WHERE o.is_deleted = false;

CREATE UNIQUE INDEX idx_mv_outlet_sales_outlet ON mv_outlet_sales (outlet_id);

-- ── Refresh function (called every 15 min by the pg-boss scheduled job) ───────
CREATE OR REPLACE FUNCTION refresh_analytics_views() RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_pl;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_outlet_sales;
EXCEPTION WHEN feature_not_supported OR object_not_in_prerequisite_state THEN
  -- First refresh (or no unique index yet): fall back to a blocking refresh.
  REFRESH MATERIALIZED VIEW mv_monthly_pl;
  REFRESH MATERIALIZED VIEW mv_outlet_sales;
END;
$$ LANGUAGE plpgsql;
