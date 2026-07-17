-- Financial P&L must reflect only the main branch's own POS counter, not
-- other outlets' independent retail sales (those belong on that outlet
-- owner's own dashboard). Materialized views can't be altered in place, so
-- this clones mv_monthly_pl verbatim from the original migration, changing
-- only the `pos` CTE's WHERE clause. mv_outlet_sales and
-- refresh_analytics_views() are untouched.

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
