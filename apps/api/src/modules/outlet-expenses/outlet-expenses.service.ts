import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/utils/AppError';
import { istRange, startOfIstDay } from '../../shared/utils/date';
import type {
  CreateOutletExpenseInput, ListOutletExpensesQuery, SetOpeningBalanceInput, UpdateOutletExpenseInput,
} from './outlet-expenses.schema';

// Nothing in this module writes to, or is read by, company accounting — these
// rows live only in outlet_expenses / outlet_opening_balances.

async function assertOutlet(outletId: string) {
  const outlet = await prisma.outlet.findFirst({ where: { id: outletId, isDeleted: false }, select: { id: true, name: true } });
  if (!outlet) throw AppError.notFound('Outlet not found');
  return outlet;
}

type DateWindow = { gte?: Date; lt?: Date };

async function posSales(outletId: string, window?: DateWindow): Promise<number> {
  const r = await prisma.posTransaction.aggregate({
    _sum: { grandTotal: true },
    where: { outletId, status: 'COMPLETED', isDeleted: false, ...(window ? { soldAt: window } : {}) },
  });
  return Number(r._sum.grandTotal ?? 0);
}

async function expenseTotal(outletId: string, window?: DateWindow): Promise<number> {
  const r = await prisma.outletExpense.aggregate({
    _sum: { amount: true },
    where: { outletId, isDeleted: false, ...(window ? { expenseDate: window } : {}) },
  });
  return Number(r._sum.amount ?? 0);
}

const net = async (outletId: string, window?: DateWindow) => {
  const [s, e] = await Promise.all([posSales(outletId, window), expenseTotal(outletId, window)]);
  return s - e;
};

/**
 * The ledger balance at the start of `at` (undefined = before any activity).
 * One running balance: the opening balance as of its date, plus POS sales minus
 * expenses since then (or minus those in between, for a point before it). With
 * no opening balance set it simply runs from ₹0 at the first entry. Either way,
 * any period's closing balance is exactly the next period's opening.
 */
async function balanceAt(
  outletId: string,
  at: Date | undefined,
  opening: { amount: Prisma.Decimal; asOfDate: Date } | null,
): Promise<number> {
  if (!opening) return at ? net(outletId, { lt: at }) : 0;
  const anchor = startOfIstDay(opening.asOfDate);
  const base = Number(opening.amount);
  if (!at) return base - (await net(outletId, { lt: anchor }));
  if (at >= anchor) return base + (await net(outletId, { gte: anchor, lt: at }));
  return base - (await net(outletId, { gte: at, lt: anchor }));
}

/**
 * Expense list for one outlet, filtered by date / shop-or-godown / payment type,
 * with its total — plus the outlet's P&L for the date range alone (the location
 * and payment filters narrow the list, they don't change what the outlet earned).
 *
 * Opening = the running balance at the start of the period (see balanceAt);
 * closing = opening + this period's net profit.
 */
export async function listOutletExpenses(q: ListOutletExpensesQuery) {
  const outlet = await assertOutlet(q.outletId);
  const range = istRange(q.from, q.to);

  const where: Prisma.OutletExpenseWhereInput = {
    outletId: q.outletId,
    isDeleted: false,
    ...(range ? { expenseDate: range } : {}),
    ...(q.location ? { location: q.location } : {}),
    ...(q.paymentMethod ? { paymentMethod: q.paymentMethod } : {}),
  };

  const [rows, sales, expenses, opening] = await Promise.all([
    prisma.outletExpense.findMany({ where, orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }] }),
    posSales(q.outletId, range),
    expenseTotal(q.outletId, range),
    prisma.outletOpeningBalance.findUnique({ where: { outletId: q.outletId } }),
  ]);

  const openingBalance = await balanceAt(q.outletId, range?.gte, opening);

  const byLocation = { SHOP: 0, GODOWN: 0 };
  const byPaymentMethod = { CASH: 0, ONLINE: 0, CHEQUE: 0, BANK: 0 };
  for (const r of rows) {
    byLocation[r.location] += Number(r.amount);
    byPaymentMethod[r.paymentMethod] += Number(r.amount);
  }

  const netProfit = sales - expenses;
  return {
    outlet,
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
    summary: {
      openingBalance,
      posSales: sales,
      totalExpenses: expenses,
      netProfit,
      closingBalance: openingBalance + netProfit,
    },
    opening: opening
      ? { amount: Number(opening.amount), asOfDate: opening.asOfDate, notes: opening.notes }
      : null,
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

export async function setOpeningBalance(input: SetOpeningBalanceInput, userId: string) {
  await assertOutlet(input.outletId);
  const data = { amount: input.amount, asOfDate: input.asOfDate, notes: input.notes ?? null };
  return prisma.outletOpeningBalance.upsert({
    where: { outletId: input.outletId },
    create: { outletId: input.outletId, ...data, createdById: userId },
    update: data,
  });
}

export const outletExpensesService = {
  listOutletExpenses, createOutletExpense, updateOutletExpense, deleteOutletExpense, setOpeningBalance,
};
