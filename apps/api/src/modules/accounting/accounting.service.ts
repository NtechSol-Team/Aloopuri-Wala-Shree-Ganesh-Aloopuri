import { startOfMonth } from 'date-fns';
import { prisma } from '../../config/prisma';
import { cache, CacheTag } from '../../config/cache';

const num = (rows: Array<{ v: number | null }>): number => Number(rows[0]?.v ?? 0);

/**
 * Financial position — management-accounting snapshot built from the live
 * financial events (payments, POS, expenses, purchases, bills, stock).
 * Flow figures are month-to-date; balances are point-in-time.
 */
export async function getPosition() {
  return cache.getOrSet('accounting:position', [CacheTag.PAYMENTS, CacheTag.BILLS, CacheTag.EXPENSES, CacheTag.DASHBOARD], async () => {
    const monthStart = startOfMonth(new Date());

    const [
      cashIn, digitalIn, posCash, posDigital, posSalesMonth, billingMonth,
      expensesMonth, purchasesMonth, receivables, rawStock, fgValue, cogsMonth, payables,
    ] = await Promise.all([
      prisma.$queryRaw<Array<{ v: number }>>`SELECT COALESCE(SUM(amount),0)::float v FROM payments WHERE is_deleted=false AND channel='CASH' AND payment_date >= ${monthStart}`,
      prisma.$queryRaw<Array<{ v: number }>>`SELECT COALESCE(SUM(amount),0)::float v FROM payments WHERE is_deleted=false AND channel='DIGITAL' AND payment_date >= ${monthStart}`,
      prisma.$queryRaw<Array<{ v: number }>>`SELECT COALESCE(SUM(cash_amount),0)::float v FROM pos_transactions WHERE status='COMPLETED' AND is_deleted=false AND sold_at >= ${monthStart}`,
      prisma.$queryRaw<Array<{ v: number }>>`SELECT COALESCE(SUM(card_amount+upi_amount),0)::float v FROM pos_transactions WHERE status='COMPLETED' AND is_deleted=false AND sold_at >= ${monthStart}`,
      prisma.$queryRaw<Array<{ v: number }>>`SELECT COALESCE(SUM(grand_total),0)::float v FROM pos_transactions WHERE status='COMPLETED' AND is_deleted=false AND sold_at >= ${monthStart}`,
      prisma.$queryRaw<Array<{ v: number }>>`SELECT COALESCE(SUM(grand_total),0)::float v FROM bills WHERE is_deleted=false AND status<>'CANCELLED' AND bill_date >= ${monthStart}`,
      prisma.$queryRaw<Array<{ v: number }>>`SELECT COALESCE(SUM(amount),0)::float v FROM expenses WHERE is_deleted=false AND expense_date >= ${monthStart}`,
      prisma.$queryRaw<Array<{ v: number }>>`SELECT COALESCE(SUM(total_cost),0)::float v FROM raw_material_intake WHERE is_deleted=false AND intake_date >= ${monthStart}`,
      prisma.$queryRaw<Array<{ v: number }>>`SELECT COALESCE(SUM(balance_due),0)::float v FROM bills WHERE is_deleted=false AND status IN ('UNPAID','PARTIALLY_PAID')`,
      prisma.$queryRaw<Array<{ v: number }>>`SELECT COALESCE(SUM(current_stock*cost_per_unit),0)::float v FROM raw_materials WHERE is_deleted=false`,
      prisma.$queryRaw<Array<{ v: number }>>`
        SELECT (
          (SELECT COALESCE(SUM(g.quantity*p.base_price),0) FROM godown_stock g JOIN products p ON p.id=g.product_id WHERE g.is_deleted=false) +
          (SELECT COALESCE(SUM(m.quantity*p.base_price),0) FROM main_branch_stock m JOIN products p ON p.id=m.product_id WHERE m.is_deleted=false) +
          (SELECT COALESCE(SUM(o.quantity*p.base_price),0) FROM outlet_stock o JOIN products p ON p.id=o.product_id WHERE o.is_deleted=false)
        )::float v`,
      prisma.$queryRaw<Array<{ v: number }>>`SELECT COALESCE(SUM(total_material_cost),0)::float v FROM production_batches WHERE is_deleted=false AND production_date >= ${monthStart}`,
      prisma.$queryRaw<Array<{ v: number }>>`SELECT COALESCE(SUM(balance_due),0)::float v FROM supplier_bills WHERE is_deleted=false AND status IN ('UNPAID','PARTIALLY_PAID')`,
    ]);

    const moneyInCash = num(cashIn) + num(posCash);
    const moneyInDigital = num(digitalIn) + num(posDigital);
    const moneyIn = moneyInCash + moneyInDigital;
    const moneyOut = num(expensesMonth) + num(purchasesMonth);
    const revenueMonth = num(posSalesMonth) + num(billingMonth);
    const grossProfit = revenueMonth - num(cogsMonth);
    const netProfit = grossProfit - num(expensesMonth);

    return {
      month: monthStart.toISOString(),
      moneyIn,
      moneyInCash,
      moneyInDigital,
      moneyOut,
      netCashFlow: moneyIn - moneyOut,
      revenueMonth,
      posSalesMonth: num(posSalesMonth),
      billingMonth: num(billingMonth),
      expensesMonth: num(expensesMonth),
      purchasesMonth: num(purchasesMonth),
      cogsMonth: num(cogsMonth),
      grossProfit,
      netProfit,
      receivables: num(receivables),
      payables: num(payables),
      rawStockValue: num(rawStock),
      finishedGoodsValue: num(fgValue),
      stockValue: num(rawStock) + num(fgValue),
    };
  });
}

export interface DayBookEntry {
  type: 'PAYMENT_IN' | 'POS_SALE' | 'EXPENSE' | 'PURCHASE';
  date: string;
  party: string | null;
  method: string | null;
  reference: string | null;
  inflow: number;
  outflow: number;
}

/** Unified chronological cash/bank ledger between two dates. */
export async function getDayBook(from: Date, to: Date) {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const rows = await prisma.$queryRawUnsafe<Array<{ type: string; txn_date: Date; party: string | null; method: string | null; reference: string | null; inflow: number; outflow: number }>>(
    `
    SELECT 'PAYMENT_IN' AS type, p.payment_date AS txn_date, o.name AS party, p.method::text AS method, p.payment_number AS reference, p.amount::float AS inflow, 0::float AS outflow
      FROM payments p JOIN outlets o ON o.id=p.outlet_id
      WHERE p.is_deleted=false AND p.payment_date BETWEEN $1::timestamptz AND $2::timestamptz
    UNION ALL
    SELECT 'POS_SALE', t.sold_at, 'POS / Walk-in', t.payment_mode::text, t.receipt_number, t.grand_total::float, 0::float
      FROM pos_transactions t WHERE t.status='COMPLETED' AND t.is_deleted=false AND t.sold_at BETWEEN $1::timestamptz AND $2::timestamptz
    UNION ALL
    SELECT 'EXPENSE', e.expense_date, e.paid_to, e.payment_method::text, ec.name, 0::float, e.amount::float
      FROM expenses e JOIN expense_categories ec ON ec.id=e.category_id
      WHERE e.is_deleted=false AND e.expense_date BETWEEN $1::timestamptz AND $2::timestamptz
    UNION ALL
    SELECT 'PURCHASE', i.intake_date, i.supplier_name, NULL, i.invoice_number, 0::float, i.total_cost::float
      FROM raw_material_intake i WHERE i.is_deleted=false AND i.intake_date BETWEEN $1::timestamptz AND $2::timestamptz
    ORDER BY txn_date DESC
    LIMIT 500`,
    fromIso,
    toIso,
  );

  const totalIn = rows.reduce((s, r) => s + Number(r.inflow), 0);
  const totalOut = rows.reduce((s, r) => s + Number(r.outflow), 0);
  return {
    entries: rows.map((r) => ({
      type: r.type as DayBookEntry['type'],
      date: r.txn_date instanceof Date ? r.txn_date.toISOString() : String(r.txn_date),
      party: r.party,
      method: r.method,
      reference: r.reference,
      inflow: Number(r.inflow),
      outflow: Number(r.outflow),
    })),
    totalIn,
    totalOut,
    net: totalIn - totalOut,
  };
}

/** Per-product profitability (last 90 days): revenue ex-tax vs BOM material cost. */
export async function getProductProfitability() {
  return prisma.$queryRawUnsafe<Array<{ name: string; qty: number; revenue: number; unit_cost: number; cogs: number; margin: number; margin_pct: number }>>(
    `
    WITH sold AS (
      SELECT product_id, SUM(qty) AS qty, SUM(rev) AS rev FROM (
        SELECT product_id, quantity AS qty, (rate*quantity) AS rev
          FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
          WHERE b.is_deleted=false AND b.status<>'CANCELLED' AND b.bill_date >= now()-interval '90 days'
        UNION ALL
        SELECT product_id, quantity, (unit_price*quantity - discount)
          FROM pos_transaction_items pi JOIN pos_transactions t ON t.id=pi.transaction_id
          WHERE t.status='COMPLETED' AND t.is_deleted=false AND t.sold_at >= now()-interval '90 days'
      ) u GROUP BY product_id
    ),
    bomcost AS (
      SELECT bom.product_id, SUM(bom.quantity*rm.cost_per_unit) AS unit_cost
        FROM bill_of_materials bom JOIN raw_materials rm ON rm.id=bom.raw_material_id
        WHERE bom.is_deleted=false GROUP BY bom.product_id
    )
    SELECT p.name,
           s.qty::float AS qty,
           s.rev::float AS revenue,
           COALESCE(bc.unit_cost,0)::float AS unit_cost,
           (COALESCE(bc.unit_cost,0)*s.qty)::float AS cogs,
           (s.rev - COALESCE(bc.unit_cost,0)*s.qty)::float AS margin,
           CASE WHEN s.rev > 0 THEN ROUND(((s.rev - COALESCE(bc.unit_cost,0)*s.qty)/s.rev*100)::numeric, 1)::float ELSE 0 END AS margin_pct
    FROM products p JOIN sold s ON s.product_id=p.id LEFT JOIN bomcost bc ON bc.product_id=p.id
    WHERE p.is_deleted=false
    ORDER BY margin DESC`,
  );
}

export const accountingService = { getPosition, getDayBook, getProductProfitability };
