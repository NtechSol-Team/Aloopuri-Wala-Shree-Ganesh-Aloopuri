import { startOfDay, startOfMonth, subMonths, endOfMonth } from 'date-fns';
import { UserRole, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';
import { AppError } from '../../shared/utils/AppError';
import type { AuthUser } from '../../shared/types/api';

export interface DashboardKpis {
  todaySales: number;
  monthRevenue: number;
  lastMonthRevenue: number;
  revenueChangePct: number;
  outstandingReceivables: number;
  lowStockCount: number;
  topProductToday: { name: string; quantity: number } | null;
  recentOrders: Array<{ id: string; orderNumber: string; outletName: string; status: string; orderDate: string }>;
  recentPayments: Array<{ id: string; paymentNumber: string; outletName: string; amount: number; method: string; paymentDate: string }>;
}

function sum(value: Prisma.Decimal | null): number {
  return value ? Number(value) : 0;
}

export function scopeOutlet(user: AuthUser): string | undefined {
  // Franchise owners + cashiers are restricted to their own outlet.
  return user.role === UserRole.FRANCHISE_OWNER || user.role === UserRole.CASHIER
    ? user.outletId ?? undefined
    : undefined;
}

export async function getDashboard(user: AuthUser): Promise<DashboardKpis> {
  const outletId = scopeOutlet(user);
  const cacheKey = `dashboard:${outletId ?? 'GLOBAL'}`;
  const tags = [CacheTag.DASHBOARD, ...(outletId ? [CacheTag.outlet(outletId)] : [])];

  return cache.getOrSet<DashboardKpis>(cacheKey, tags, async () => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const monthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    const posWhere = (from: Date, to?: Date): Prisma.PosTransactionWhereInput => ({
      status: 'COMPLETED',
      isDeleted: false,
      soldAt: to ? { gte: from, lte: to } : { gte: from },
      ...(outletId ? { outletId } : {}),
    });
    const billWhere = (from: Date, to?: Date): Prisma.BillWhereInput => ({
      isDeleted: false,
      status: { not: 'CANCELLED' },
      billDate: to ? { gte: from, lte: to } : { gte: from },
      ...(outletId ? { outletId } : {}),
    });

    const [
      posToday,
      posMonth,
      posLastMonth,
      billMonth,
      billLastMonth,
      outstanding,
      recentOrders,
      recentPayments,
      lowStock,
      topProduct,
    ] = await Promise.all([
      prisma.posTransaction.aggregate({ _sum: { grandTotal: true }, where: posWhere(todayStart) }),
      prisma.posTransaction.aggregate({ _sum: { grandTotal: true }, where: posWhere(monthStart) }),
      prisma.posTransaction.aggregate({ _sum: { grandTotal: true }, where: posWhere(lastMonthStart, lastMonthEnd) }),
      prisma.bill.aggregate({ _sum: { grandTotal: true }, where: billWhere(monthStart) }),
      prisma.bill.aggregate({ _sum: { grandTotal: true }, where: billWhere(lastMonthStart, lastMonthEnd) }),
      prisma.bill.aggregate({
        _sum: { balanceDue: true },
        where: { isDeleted: false, status: { in: ['UNPAID', 'PARTIALLY_PAID'] }, ...(outletId ? { outletId } : {}) },
      }),
      prisma.outletOrder.findMany({
        where: { isDeleted: false, ...(outletId ? { outletId } : {}) },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, orderNumber: true, status: true, orderDate: true, outlet: { select: { name: true } } },
      }),
      prisma.payment.findMany({
        where: { isDeleted: false, ...(outletId ? { outletId } : {}) },
        orderBy: { paymentDate: 'desc' },
        take: 5,
        select: { id: true, paymentNumber: true, amount: true, method: true, paymentDate: true, outlet: { select: { name: true } } },
      }),
      getLowStockCount(outletId),
      getTopProductToday(todayStart, outletId),
    ]);

    const monthRevenue = sum(posMonth._sum.grandTotal) + sum(billMonth._sum.grandTotal);
    const lastMonthRevenue = sum(posLastMonth._sum.grandTotal) + sum(billLastMonth._sum.grandTotal);
    const revenueChangePct =
      lastMonthRevenue > 0 ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100 : monthRevenue > 0 ? 100 : 0;

    return {
      todaySales: sum(posToday._sum.grandTotal),
      monthRevenue,
      lastMonthRevenue,
      revenueChangePct: Math.round(revenueChangePct * 10) / 10,
      outstandingReceivables: sum(outstanding._sum.balanceDue),
      lowStockCount: lowStock,
      topProductToday: topProduct,
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        outletName: o.outlet.name,
        status: o.status,
        orderDate: o.orderDate.toISOString(),
      })),
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        paymentNumber: p.paymentNumber,
        outletName: p.outlet.name,
        amount: Number(p.amount),
        method: p.method,
        paymentDate: p.paymentDate.toISOString(),
      })),
    };
  });
}

async function getLowStockCount(outletId?: string): Promise<number> {
  if (outletId) {
    const rows = await prisma.$queryRaw<Array<{ c: number }>>`
      SELECT count(*)::int AS c FROM outlet_stock WHERE outlet_id = ${outletId}::uuid AND is_deleted = false AND quantity < 5`;
    return rows[0]?.c ?? 0;
  }
  // Admin / godown: main-branch finished goods + raw materials below reorder.
  const rows = await prisma.$queryRaw<Array<{ c: number }>>`
    SELECT
      (SELECT count(*) FROM products p
        JOIN main_branch_stock m ON m.product_id = p.id
        WHERE p.is_deleted = false AND p.is_active = true AND m.quantity < p.reorder_level)
      +
      (SELECT count(*) FROM raw_materials
        WHERE is_deleted = false AND is_active = true AND current_stock < reorder_level)
      AS c`;
  return Number(rows[0]?.c ?? 0);
}

async function getTopProductToday(
  from: Date,
  outletId?: string,
): Promise<{ name: string; quantity: number } | null> {
  const rows = outletId
    ? await prisma.$queryRaw<Array<{ name: string; qty: number }>>`
        SELECT i.product_name_snapshot AS name, SUM(i.quantity)::float AS qty
        FROM pos_transaction_items i
        JOIN pos_transactions t ON t.id = i.transaction_id
        WHERE t.status = 'COMPLETED' AND t.is_deleted = false AND t.sold_at >= ${from} AND t.outlet_id = ${outletId}::uuid
        GROUP BY i.product_name_snapshot ORDER BY qty DESC LIMIT 1`
    : await prisma.$queryRaw<Array<{ name: string; qty: number }>>`
        SELECT i.product_name_snapshot AS name, SUM(i.quantity)::float AS qty
        FROM pos_transaction_items i
        JOIN pos_transactions t ON t.id = i.transaction_id
        WHERE t.status = 'COMPLETED' AND t.is_deleted = false AND t.sold_at >= ${from}
        GROUP BY i.product_name_snapshot ORDER BY qty DESC LIMIT 1`;
  const top = rows[0];
  return top ? { name: top.name, quantity: top.qty } : null;
}

// ─────────────────────────────── Reporting analytics (admin) ────────────────

export type TrendPeriod = 'daily' | 'weekly' | 'monthly';

/** Revenue trend (POS + billing) bucketed by day/week/month. */
export async function getRevenueTrend(period: TrendPeriod) {
  const cfg: Record<TrendPeriod, { trunc: string; interval: string; fmt: string }> = {
    daily: { trunc: 'day', interval: '30 days', fmt: 'YYYY-MM-DD' },
    weekly: { trunc: 'week', interval: '12 weeks', fmt: 'YYYY-"W"IW' },
    monthly: { trunc: 'month', interval: '12 months', fmt: 'YYYY-MM' },
  };
  const c = cfg[period];
  const rows = await prisma.$queryRawUnsafe<Array<{ bucket: string; pos: number; billing: number }>>(
    `WITH pos AS (
        SELECT date_trunc('${c.trunc}', sold_at) AS b, SUM(grand_total) AS v
        FROM pos_transactions WHERE status='COMPLETED' AND is_deleted=false AND sold_at >= now() - interval '${c.interval}' GROUP BY 1),
      billing AS (
        SELECT date_trunc('${c.trunc}', bill_date) AS b, SUM(grand_total) AS v
        FROM bills WHERE is_deleted=false AND status<>'CANCELLED' AND bill_date >= now() - interval '${c.interval}' GROUP BY 1)
      SELECT to_char(COALESCE(pos.b, billing.b), '${c.fmt}') AS bucket,
             COALESCE(pos.v,0)::float AS pos, COALESCE(billing.v,0)::float AS billing
      FROM pos FULL OUTER JOIN billing ON pos.b = billing.b
      ORDER BY 1`,
  );
  return rows.map((r) => ({ bucket: r.bucket, pos: r.pos, billing: r.billing, total: r.pos + r.billing }));
}

/** Top products by revenue and by quantity (POS + bill items, last 90 days). */
export async function getTopProducts() {
  const byRevenue = await prisma.$queryRawUnsafe<Array<{ name: string; revenue: number }>>(
    `SELECT name, SUM(revenue)::float AS revenue FROM (
        SELECT product_name_snapshot AS name, SUM(line_total) AS revenue FROM pos_transaction_items i JOIN pos_transactions t ON t.id=i.transaction_id WHERE t.status='COMPLETED' AND t.is_deleted=false AND t.sold_at >= now() - interval '90 days' GROUP BY 1
        UNION ALL
        SELECT product_name_snapshot AS name, SUM(line_total) AS revenue FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE b.is_deleted=false AND b.status<>'CANCELLED' AND b.bill_date >= now() - interval '90 days' GROUP BY 1
      ) u GROUP BY name ORDER BY revenue DESC LIMIT 10`,
  );
  const byQuantity = await prisma.$queryRawUnsafe<Array<{ name: string; qty: number }>>(
    `SELECT name, SUM(qty)::float AS qty FROM (
        SELECT product_name_snapshot AS name, SUM(quantity) AS qty FROM pos_transaction_items i JOIN pos_transactions t ON t.id=i.transaction_id WHERE t.status='COMPLETED' AND t.is_deleted=false AND t.sold_at >= now() - interval '90 days' GROUP BY 1
        UNION ALL
        SELECT product_name_snapshot AS name, SUM(quantity) AS qty FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE b.is_deleted=false AND b.status<>'CANCELLED' AND b.bill_date >= now() - interval '90 days' GROUP BY 1
      ) u GROUP BY name ORDER BY qty DESC LIMIT 10`,
  );
  return { byRevenue, byQuantity };
}

/** Monthly P&L from the materialized view. */
export async function getFinancial() {
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT to_char(month,'YYYY-MM') AS month, pos_revenue::float, billing_revenue::float, total_revenue::float, cogs::float, expenses::float, gross_profit::float, net_profit::float FROM mv_monthly_pl ORDER BY month`,
  );
  const current = rows[rows.length - 1] ?? null;
  return { monthly: rows, current };
}

/** Outlet performance from the materialized view. */
export async function getOutletPerformance() {
  return prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT outlet_id, outlet_name, total_orders::int, total_billed::float, total_paid::float, outstanding::float, last_order_date FROM mv_outlet_sales ORDER BY total_billed DESC`,
  );
}

/** Inventory analytics: low stock + slow-moving products. */
export async function getInventoryAnalytics() {
  const lowStock = await prisma.$queryRawUnsafe<Array<{ name: string; location: string; quantity: number; reorder: number }>>(
    `SELECT p.name, 'Main Branch' AS location, m.quantity::float, p.reorder_level::float AS reorder
       FROM products p JOIN main_branch_stock m ON m.product_id=p.id
       WHERE p.is_deleted=false AND p.is_active=true AND m.quantity < p.reorder_level
     UNION ALL
     SELECT name, 'Raw Material' AS location, current_stock::float, reorder_level::float
       FROM raw_materials WHERE is_deleted=false AND is_active=true AND current_stock < reorder_level
     ORDER BY 1`,
  );
  const slowMoving = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT p.name FROM products p
       WHERE p.is_deleted=false AND p.is_active=true
       AND NOT EXISTS (
         SELECT 1 FROM outlet_order_items oi JOIN outlet_orders o ON o.id=oi.order_id
         WHERE oi.product_id=p.id AND o.order_date >= now() - interval '30 days')
       AND NOT EXISTS (
         SELECT 1 FROM pos_transaction_items pi JOIN pos_transactions t ON t.id=pi.transaction_id
         WHERE pi.product_id=p.id AND t.sold_at >= now() - interval '30 days')
       ORDER BY p.name LIMIT 20`,
  );
  return { lowStock, slowMoving: slowMoving.map((s) => s.name) };
}

/** Deep per-outlet analysis: 12-month trend, MoM/YoY, top products, payment behaviour. */
export async function getOutletDetail(outletId: string) {
  const outlet = await prisma.outlet.findFirst({ where: { id: outletId, isDeleted: false }, select: { id: true, name: true, code: true, creditPeriodDays: true } });
  if (!outlet) throw AppError.notFound('Outlet not found');

  const [monthly, topProducts, summaryRows, momYoyRows, payBehaviour] = await Promise.all([
    // 12-month trend: orders count, billed, paid
    prisma.$queryRawUnsafe<Array<{ month: string; orders: number; billed: number; paid: number }>>(
      `WITH months AS (
         SELECT generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') AS m
       ),
       o AS (SELECT date_trunc('month', order_date) m, count(*)::int c FROM outlet_orders WHERE outlet_id=$1::uuid AND is_deleted=false GROUP BY 1),
       b AS (SELECT date_trunc('month', bill_date) m, SUM(grand_total) v FROM bills WHERE outlet_id=$1::uuid AND is_deleted=false AND status<>'CANCELLED' GROUP BY 1),
       p AS (SELECT date_trunc('month', payment_date) m, SUM(amount) v FROM payments WHERE outlet_id=$1::uuid AND is_deleted=false GROUP BY 1)
       SELECT to_char(months.m,'YYYY-MM') AS month, COALESCE(o.c,0)::int AS orders, COALESCE(b.v,0)::float AS billed, COALESCE(p.v,0)::float AS paid
       FROM months LEFT JOIN o ON o.m=months.m LEFT JOIN b ON b.m=months.m LEFT JOIN p ON p.m=months.m
       ORDER BY months.m`,
      outletId,
    ),
    // Top products this outlet actually buys (billed)
    prisma.$queryRawUnsafe<Array<{ name: string; qty: number; value: number }>>(
      `SELECT bi.product_name_snapshot AS name, SUM(bi.quantity)::float AS qty, SUM(bi.rate*bi.quantity)::float AS value
       FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
       WHERE b.outlet_id=$1::uuid AND b.is_deleted=false AND b.status<>'CANCELLED'
       GROUP BY 1 ORDER BY value DESC LIMIT 10`,
      outletId,
    ),
    // Lifetime summary
    prisma.$queryRawUnsafe<Array<{ lifetime_orders: number; total_billed: number; total_paid: number; outstanding: number; last_order: Date | null }>>(
      `SELECT
         (SELECT count(*) FROM outlet_orders WHERE outlet_id=$1::uuid AND is_deleted=false)::int AS lifetime_orders,
         (SELECT COALESCE(SUM(grand_total),0) FROM bills WHERE outlet_id=$1::uuid AND is_deleted=false AND status<>'CANCELLED')::float AS total_billed,
         (SELECT COALESCE(SUM(amount_paid),0) FROM bills WHERE outlet_id=$1::uuid AND is_deleted=false AND status<>'CANCELLED')::float AS total_paid,
         (SELECT COALESCE(SUM(balance_due),0) FROM bills WHERE outlet_id=$1::uuid AND is_deleted=false AND status IN ('UNPAID','PARTIALLY_PAID'))::float AS outstanding,
         (SELECT MAX(order_date) FROM outlet_orders WHERE outlet_id=$1::uuid AND is_deleted=false) AS last_order`,
      outletId,
    ),
    // This month / last month / same month last year (orders + billed)
    prisma.$queryRawUnsafe<Array<{ bucket: string; orders: number; billed: number }>>(
      `SELECT b.bucket, COALESCE(o.c,0)::int AS orders, COALESCE(bl.v,0)::float AS billed FROM (
         VALUES ('this', date_trunc('month', now())),
                ('last', date_trunc('month', now()) - interval '1 month'),
                ('yoy',  date_trunc('month', now()) - interval '1 year')
       ) AS b(bucket, m)
       LEFT JOIN (SELECT date_trunc('month', order_date) m, count(*) c FROM outlet_orders WHERE outlet_id=$1::uuid AND is_deleted=false GROUP BY 1) o ON o.m=b.m
       LEFT JOIN (SELECT date_trunc('month', bill_date) m, SUM(grand_total) v FROM bills WHERE outlet_id=$1::uuid AND is_deleted=false AND status<>'CANCELLED' GROUP BY 1) bl ON bl.m=b.m`,
      outletId,
    ),
    // Payment behaviour: avg days from bill to (last) payment for paid bills
    prisma.$queryRawUnsafe<Array<{ avg_days: number | null }>>(
      `SELECT AVG(EXTRACT(EPOCH FROM (pay.last_paid - b.bill_date))/86400)::float AS avg_days
       FROM bills b
       JOIN (SELECT bill_id, MAX(payment_date) last_paid FROM payments WHERE is_deleted=false GROUP BY bill_id) pay ON pay.bill_id=b.id
       WHERE b.outlet_id=$1::uuid AND b.is_deleted=false AND b.status='PAID'`,
      outletId,
    ),
  ]);

  const s = summaryRows[0];
  const mom = new Map(momYoyRows.map((r) => [r.bucket, r]));
  const thisM = mom.get('this') ?? { orders: 0, billed: 0 };
  const lastM = mom.get('last') ?? { orders: 0, billed: 0 };
  const yoyM = mom.get('yoy') ?? { orders: 0, billed: 0 };
  const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur > 0 ? 100 : 0);

  return {
    outlet,
    summary: {
      lifetimeOrders: s?.lifetime_orders ?? 0,
      totalBilled: s?.total_billed ?? 0,
      totalPaid: s?.total_paid ?? 0,
      outstanding: s?.outstanding ?? 0,
      avgOrderValue: (s?.lifetime_orders ?? 0) > 0 ? Math.round(((s?.total_billed ?? 0) / s!.lifetime_orders) * 100) / 100 : 0,
      lastOrderDate: s?.last_order ? new Date(s.last_order).toISOString() : null,
      avgDaysToPay: payBehaviour[0]?.avg_days != null ? Math.round(payBehaviour[0].avg_days * 10) / 10 : null,
      thisMonth: { orders: thisM.orders, billed: thisM.billed },
      lastMonth: { orders: lastM.orders, billed: lastM.billed },
      sameMonthLastYear: { orders: yoyM.orders, billed: yoyM.billed },
      momRevenuePct: pct(thisM.billed, lastM.billed),
      yoyRevenuePct: pct(thisM.billed, yoyM.billed),
      momOrdersPct: pct(thisM.orders, lastM.orders),
    },
    monthly,
    topProducts,
  };
}

/**
 * POS-only counter analytics: daily trend, KPIs, payment mix, peak hours, top
 * items, cashier leaderboard. `outletId` scopes everything to one outlet (for
 * a franchise owner viewing only their own counter); omitted = store-wide.
 */
export async function getPosAnalytics(outletId: string | null = null) {
  // Every subquery below ANDs this in — `$1::uuid IS NULL` short-circuits to
  // "no filter" for the store-wide (super admin) view.
  const outletFilter = '($1::uuid IS NULL OR outlet_id = $1::uuid)';
  const outletFilterT = '($1::uuid IS NULL OR t.outlet_id = $1::uuid)';

  const [daily, summaryRows, byPaymentMode, byHourRaw, topItems, byCashier] = await Promise.all([
    // Last 30 days, one row per calendar day (zero-filled).
    prisma.$queryRawUnsafe<Array<{ date: string; revenue: number; transactions: number; items_sold: number; voided: number; voided_amount: number }>>(
      `WITH days AS (
         SELECT generate_series(current_date - interval '29 days', current_date, interval '1 day')::date AS day
       ),
       txn AS (
         SELECT date_trunc('day', sold_at)::date AS day, SUM(grand_total) AS revenue, count(*) AS txns
         FROM pos_transactions
         WHERE status = 'COMPLETED' AND is_deleted = false AND sold_at >= current_date - interval '29 days' AND ${outletFilter}
         GROUP BY 1
       ),
       items AS (
         SELECT date_trunc('day', t.sold_at)::date AS day, SUM(i.quantity) AS qty
         FROM pos_transaction_items i JOIN pos_transactions t ON t.id = i.transaction_id
         WHERE t.status = 'COMPLETED' AND t.is_deleted = false AND i.is_deleted = false AND t.sold_at >= current_date - interval '29 days' AND ${outletFilterT}
         GROUP BY 1
       ),
       voids AS (
         SELECT date_trunc('day', sold_at)::date AS day, count(*) AS voided, SUM(grand_total) AS voided_amount
         FROM pos_transactions
         WHERE status = 'VOID' AND is_deleted = false AND sold_at >= current_date - interval '29 days' AND ${outletFilter}
         GROUP BY 1
       )
       SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
              COALESCE(txn.revenue, 0)::float AS revenue,
              COALESCE(txn.txns, 0)::int AS transactions,
              COALESCE(items.qty, 0)::float AS items_sold,
              COALESCE(voids.voided, 0)::int AS voided,
              COALESCE(voids.voided_amount, 0)::float AS voided_amount
       FROM days
       LEFT JOIN txn ON txn.day = days.day
       LEFT JOIN items ON items.day = days.day
       LEFT JOIN voids ON voids.day = days.day
       ORDER BY days.day`,
      outletId,
    ),
    // Headline KPIs: today + this month.
    prisma.$queryRawUnsafe<Array<{
      today_revenue: number; today_txns: number; month_revenue: number; month_txns: number;
      month_voids: number; month_voided_amount: number;
    }>>(
      `SELECT
         (SELECT COALESCE(SUM(grand_total),0) FROM pos_transactions WHERE status='COMPLETED' AND is_deleted=false AND sold_at >= current_date AND ${outletFilter})::float AS today_revenue,
         (SELECT count(*) FROM pos_transactions WHERE status='COMPLETED' AND is_deleted=false AND sold_at >= current_date AND ${outletFilter})::int AS today_txns,
         (SELECT COALESCE(SUM(grand_total),0) FROM pos_transactions WHERE status='COMPLETED' AND is_deleted=false AND sold_at >= date_trunc('month', now()) AND ${outletFilter})::float AS month_revenue,
         (SELECT count(*) FROM pos_transactions WHERE status='COMPLETED' AND is_deleted=false AND sold_at >= date_trunc('month', now()) AND ${outletFilter})::int AS month_txns,
         (SELECT count(*) FROM pos_transactions WHERE status='VOID' AND is_deleted=false AND sold_at >= date_trunc('month', now()) AND ${outletFilter})::int AS month_voids,
         (SELECT COALESCE(SUM(grand_total),0) FROM pos_transactions WHERE status='VOID' AND is_deleted=false AND sold_at >= date_trunc('month', now()) AND ${outletFilter})::float AS month_voided_amount`,
      outletId,
    ),
    // This month's payment-mode mix.
    prisma.$queryRawUnsafe<Array<{ payment_mode: string; revenue: number; txns: number }>>(
      `SELECT payment_mode, SUM(grand_total)::float AS revenue, count(*)::int AS txns
       FROM pos_transactions
       WHERE status='COMPLETED' AND is_deleted=false AND sold_at >= date_trunc('month', now()) AND ${outletFilter}
       GROUP BY 1 ORDER BY revenue DESC`,
      outletId,
    ),
    // Last 30 days, by hour of day (0-23) — peak hours.
    prisma.$queryRawUnsafe<Array<{ hour: number; revenue: number; txns: number }>>(
      `SELECT EXTRACT(HOUR FROM sold_at)::int AS hour, SUM(grand_total)::float AS revenue, count(*)::int AS txns
       FROM pos_transactions
       WHERE status='COMPLETED' AND is_deleted=false AND sold_at >= now() - interval '30 days' AND ${outletFilter}
       GROUP BY 1 ORDER BY 1`,
      outletId,
    ),
    // All POS items sold, last 30 days (POS-only, not mixed with billing) — the
    // full item-wise report; topByQty/topByRevenue below just slice the top 10 of it.
    prisma.$queryRawUnsafe<Array<{ name: string; category: string; qty: number; revenue: number }>>(
      `SELECT i.product_name_snapshot AS name, COALESCE(pc.name, 'Uncategorised') AS category,
              SUM(i.quantity)::float AS qty, SUM(i.line_total)::float AS revenue
       FROM pos_transaction_items i
       JOIN pos_transactions t ON t.id = i.transaction_id
       LEFT JOIN products p ON p.id = i.product_id
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       WHERE t.status='COMPLETED' AND t.is_deleted=false AND i.is_deleted=false AND t.sold_at >= now() - interval '30 days' AND ${outletFilterT}
       GROUP BY 1, 2 ORDER BY revenue DESC`,
      outletId,
    ),
    // This month's cashier leaderboard.
    prisma.$queryRawUnsafe<Array<{ cashier: string; revenue: number; txns: number }>>(
      `SELECT u.name AS cashier, SUM(t.grand_total)::float AS revenue, count(*)::int AS txns
       FROM pos_transactions t JOIN users u ON u.id = t.sold_by
       WHERE t.status='COMPLETED' AND t.is_deleted=false AND t.sold_at >= date_trunc('month', now()) AND ${outletFilterT}
       GROUP BY 1 ORDER BY revenue DESC`,
      outletId,
    ),
  ]);

  const s = summaryRows[0];
  const hourMap = new Map(byHourRaw.map((h) => [h.hour, h]));
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    revenue: hourMap.get(hour)?.revenue ?? 0,
    transactions: hourMap.get(hour)?.txns ?? 0,
  }));
  const topByQty = [...topItems].sort((a, b) => b.qty - a.qty).slice(0, 10);
  const topByRevenue = [...topItems].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const itemsRevenueTotal = topItems.reduce((s2, i) => s2 + i.revenue, 0);
  const itemsReport = topItems.map((i) => ({
    name: i.name,
    category: i.category,
    qty: i.qty,
    revenue: i.revenue,
    avgPrice: i.qty > 0 ? Math.round((i.revenue / i.qty) * 100) / 100 : 0,
    revenueSharePct: itemsRevenueTotal > 0 ? Math.round((i.revenue / itemsRevenueTotal) * 1000) / 10 : 0,
  }));

  return {
    summary: {
      todayRevenue: s?.today_revenue ?? 0,
      todayTransactions: s?.today_txns ?? 0,
      monthRevenue: s?.month_revenue ?? 0,
      monthTransactions: s?.month_txns ?? 0,
      avgBillValue: (s?.month_txns ?? 0) > 0 ? Math.round(((s?.month_revenue ?? 0) / s!.month_txns) * 100) / 100 : 0,
      monthVoids: s?.month_voids ?? 0,
      monthVoidedAmount: s?.month_voided_amount ?? 0,
    },
    daily: daily.map((d) => ({ date: d.date, revenue: d.revenue, transactions: d.transactions, itemsSold: d.items_sold, voided: d.voided, voidedAmount: d.voided_amount })),
    byPaymentMode: byPaymentMode.map((p) => ({ mode: p.payment_mode, revenue: p.revenue, transactions: p.txns })),
    byHour,
    topByQty,
    topByRevenue,
    // Full item-wise report (last 30 days), every item sold — not just the top 10.
    itemsReport,
    byCashier: byCashier.map((c) => ({ cashier: c.cashier, revenue: c.revenue, transactions: c.txns })),
  };
}

export const analyticsService = {
  getDashboard,
  getRevenueTrend,
  getTopProducts,
  getFinancial,
  getOutletPerformance,
  getInventoryAnalytics,
  getOutletDetail,
  getPosAnalytics,
};
