-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Financial-year document numbering
--
-- Invoice/voucher series now restart at 00001 each Indian financial year, so the
-- counter is keyed per year ("BILL:2026") instead of globally ("BILL").
--
-- Existing counters are RENAMED rather than reset, so the current year's sequence
-- continues from where it is and no new document can collide with a number that
-- has already been issued. Identity codes (USER_CODE, EMPLOYEE, ASSET, …) are left
-- alone: those must stay unique for the life of the record, not restart annually.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE document_counters
SET key = key || ':' || (
  CASE
    WHEN EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')) >= 4
      THEN EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata'))
    ELSE EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata')) - 1
  END
)::int::text
WHERE key IN ('BILL', 'ORDER', 'PAYMENT', 'POS_RECEIPT', 'SUPPLIER_BILL', 'SUPPLIER_PAYMENT');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Report correctness
--
-- total_orders counted cancelled orders, so an outlet that placed 5 real orders and
-- cancelled 5 reported 10. last_order_date could likewise point at a cancelled one.
--
-- mv_monthly_pl also counted every outlet's POS takings and branch-borne expenses as
-- the company's own, while Financial Position deliberately restricts both to the
-- company books (outlet_id IS NULL) — so the same month reported two different
-- numbers in two places. Both now agree.
-- ─────────────────────────────────────────────────────────────────────────────
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
  WHERE status = 'COMPLETED' AND is_deleted = false AND outlet_id IS NULL
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
  WHERE is_deleted = false AND outlet_id IS NULL
  GROUP BY 1
)
SELECT
  m.month,
  COALESCE(pos.pos_revenue, 0)                                        AS pos_revenue,
  COALESCE(billing.billing_revenue, 0)                                AS billing_revenue,
  COALESCE(pos.pos_revenue, 0) + COALESCE(billing.billing_revenue, 0) AS total_revenue,
  COALESCE(cogs.cogs, 0)                                              AS cogs,
  COALESCE(exp.expenses, 0)                                           AS expenses,
  (COALESCE(pos.pos_revenue, 0) + COALESCE(billing.billing_revenue, 0)) - COALESCE(cogs.cogs, 0) AS gross_profit,
  (COALESCE(pos.pos_revenue, 0) + COALESCE(billing.billing_revenue, 0)) - COALESCE(cogs.cogs, 0) - COALESCE(exp.expenses, 0) AS net_profit
FROM months m
LEFT JOIN pos     ON pos.month = m.month
LEFT JOIN billing ON billing.month = m.month
LEFT JOIN cogs    ON cogs.month = m.month
LEFT JOIN exp     ON exp.month = m.month
ORDER BY m.month;

CREATE UNIQUE INDEX idx_mv_monthly_pl_month ON mv_monthly_pl (month);

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
  WHERE is_deleted = false AND status <> 'CANCELLED'
  GROUP BY outlet_id
) ord ON ord.outlet_id = o.id
LEFT JOIN (
  SELECT outlet_id,
         SUM(grand_total)                                            AS total_billed,
         SUM(amount_paid)                                            AS total_paid,
         SUM(CASE WHEN status <> 'PAID' THEN balance_due ELSE 0 END)  AS outstanding
  FROM bills
  WHERE is_deleted = false AND status <> 'CANCELLED'
  GROUP BY outlet_id
) bl ON bl.outlet_id = o.id
WHERE o.is_deleted = false;

CREATE UNIQUE INDEX idx_mv_outlet_sales_outlet ON mv_outlet_sales (outlet_id);
