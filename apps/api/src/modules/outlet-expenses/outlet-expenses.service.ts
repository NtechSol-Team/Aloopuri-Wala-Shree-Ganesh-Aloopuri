import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/utils/AppError';
import { istDayString } from '../../shared/utils/date';
import type {
  CreateOutletExpenseInput, CreateWithdrawalInput, MonthStatementQuery, UpdateOutletExpenseInput,
} from './outlet-expenses.schema';

// Nothing in this module writes to, or is read by, company accounting — these
// rows live only in outlet_expenses / outlet_withdrawals.

type Db = Prisma.TransactionClient | typeof prisma;

async function assertOutlet(outletId: string) {
  const outlet = await prisma.outlet.findFirst({ where: { id: outletId, isDeleted: false }, select: { id: true, name: true } });
  if (!outlet) throw AppError.notFound('Outlet not found');
  return outlet;
}

/** [1st of the month, 1st of the next month) in IST. */
function monthWindow(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const next = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  return {
    gte: new Date(`${year}-${pad(month)}-01T00:00:00+05:30`),
    lt: new Date(`${next.y}-${pad(next.m)}-01T00:00:00+05:30`),
  };
}

function assertNotFutureMonth(year: number, month: number) {
  const [cy, cm] = istDayString(new Date()).split('-').map(Number);
  if (year * 12 + month > cy * 12 + cm) throw AppError.badRequest('That month has not started yet', undefined, 'month');
}

/**
 * One month, standing alone — nothing carries in from the month before:
 *   shop revenue (POS sales) − shop expenses − godown expenses = net profit
 *   net profit − withdrawn = pending (profit still not taken out)
 */
async function monthFigures(db: Db, outletId: string, year: number, month: number) {
  const window = monthWindow(year, month);
  const [sales, byLoc, withdrawn] = await Promise.all([
    db.posTransaction.aggregate({ _sum: { grandTotal: true }, where: { outletId, status: 'COMPLETED', isDeleted: false, soldAt: window } }),
    db.outletExpense.groupBy({ by: ['location'], _sum: { amount: true }, where: { outletId, isDeleted: false, expenseDate: window } }),
    db.outletWithdrawal.aggregate({ _sum: { amount: true }, where: { outletId, isDeleted: false, year, month } }),
  ]);
  const shopRevenue = Number(sales._sum.grandTotal ?? 0);
  const shopExpenses = Number(byLoc.find((r) => r.location === 'SHOP')?._sum.amount ?? 0);
  const godownExpenses = Number(byLoc.find((r) => r.location === 'GODOWN')?._sum.amount ?? 0);
  const netProfit = shopRevenue - shopExpenses - godownExpenses;
  const withdrawnTotal = Number(withdrawn._sum.amount ?? 0);
  return {
    shopRevenue,
    shopExpenses,
    godownExpenses,
    totalExpenses: shopExpenses + godownExpenses,
    netProfit,
    withdrawn: withdrawnTotal,
    pending: netProfit - withdrawnTotal,
  };
}

/** Month statement plus that month's expense list (filterable) and withdrawals. */
export async function getMonthStatement(q: MonthStatementQuery) {
  const outlet = await assertOutlet(q.outletId);
  const window = monthWindow(q.year, q.month);
  const where: Prisma.OutletExpenseWhereInput = {
    outletId: q.outletId,
    isDeleted: false,
    expenseDate: window,
    ...(q.location ? { location: q.location } : {}),
    ...(q.paymentMethod ? { paymentMethod: q.paymentMethod } : {}),
  };

  const [rows, summary, withdrawals] = await Promise.all([
    prisma.outletExpense.findMany({ where, orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }] }),
    monthFigures(prisma, q.outletId, q.year, q.month),
    prisma.outletWithdrawal.findMany({
      where: { outletId: q.outletId, isDeleted: false, year: q.year, month: q.month },
      orderBy: [{ withdrawDate: 'desc' }, { createdAt: 'desc' }],
    }),
  ]);

  const byLocation = { SHOP: 0, GODOWN: 0 };
  const byPaymentMethod = { CASH: 0, ONLINE: 0, CHEQUE: 0, BANK: 0 };
  for (const r of rows) {
    byLocation[r.location] += Number(r.amount);
    byPaymentMethod[r.paymentMethod] += Number(r.amount);
  }

  return {
    outlet,
    period: { year: q.year, month: q.month },
    summary,
    rows: rows.map((r) => ({
      id: r.id,
      expenseDate: r.expenseDate,
      description: r.description,
      amount: Number(r.amount),
      paymentMethod: r.paymentMethod,
      location: r.location,
    })),
    filteredTotal: rows.reduce((s, r) => s + Number(r.amount), 0),
    byLocation,
    byPaymentMethod,
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      withdrawDate: w.withdrawDate,
      amount: Number(w.amount),
      paymentMethod: w.paymentMethod,
      notes: w.notes,
    })),
  };
}

export async function createOutletExpense(input: CreateOutletExpenseInput, userId: string) {
  await assertOutlet(input.outletId);
  return prisma.outletExpense.create({ data: { ...input, createdById: userId } });
}

export async function updateOutletExpense(id: string, input: UpdateOutletExpenseInput) {
  const existing = await prisma.outletExpense.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Expense not found');
  return prisma.outletExpense.update({ where: { id }, data: input });
}

export async function deleteOutletExpense(id: string) {
  const existing = await prisma.outletExpense.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Expense not found');
  await prisma.outletExpense.update({ where: { id }, data: { isDeleted: true } });
  return { deleted: true };
}

/**
 * Take money out of one month's profit. Never more than is still pending — two
 * withdrawals saved at the same moment are serialised by a per-outlet-month
 * lock, so they can't both pass the check and over-draw the month.
 */
export async function createWithdrawal(input: CreateWithdrawalInput, userId: string) {
  await assertOutlet(input.outletId);
  assertNotFutureMonth(input.year, input.month);
  if (input.withdrawDate < monthWindow(input.year, input.month).gte) {
    throw AppError.badRequest('Withdrawal date cannot be before the month it is taken from', undefined, 'withdrawDate');
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`outlet-withdrawal:${input.outletId}:${input.year}-${input.month}`}))`;
    const { pending } = await monthFigures(tx, input.outletId, input.year, input.month);
    if (input.amount > pending + 0.001) {
      throw AppError.badRequest(
        pending > 0
          ? `Only ₹${pending.toFixed(2)} of this month's profit is left to withdraw.`
          : 'Nothing is left to withdraw for this month.',
        undefined,
        'amount',
      );
    }
    return tx.outletWithdrawal.create({
      data: {
        outletId: input.outletId,
        year: input.year,
        month: input.month,
        withdrawDate: input.withdrawDate,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        notes: input.notes || null,
        createdById: userId,
      },
    });
  });
}

export async function deleteWithdrawal(id: string) {
  const existing = await prisma.outletWithdrawal.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Withdrawal not found');
  await prisma.outletWithdrawal.update({ where: { id }, data: { isDeleted: true } });
  return { deleted: true };
}

export const outletExpensesService = {
  getMonthStatement, createOutletExpense, updateOutletExpense, deleteOutletExpense, createWithdrawal, deleteWithdrawal,
};
