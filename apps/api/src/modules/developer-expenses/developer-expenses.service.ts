import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/utils/AppError';
import type { CreateDeveloperExpenseInput, UpdateDeveloperExpenseInput } from './developer-expenses.schema';

type ExpenseRow = Prisma.DeveloperExpenseGetPayload<Record<string, never>>;

/** Month index since year 0 — lets month spans be compared with plain arithmetic. */
function monthIndex(d: Date): number {
  return d.getFullYear() * 12 + d.getMonth();
}

/**
 * What one expense contributes to a window, in rupees.
 *
 * A one-off counts once if its date falls inside the window. A recurring one
 * counts its amount for every calendar month where the subscription and the
 * window overlap — derived from the span rather than stored per month, so
 * cancelling a subscription is a single edit and never leaves stale rows.
 */
function contributionInWindow(e: ExpenseRow, windowStart: Date, windowEnd: Date): number {
  const amount = Number(e.amount);
  if (!e.isRecurring) {
    return e.incurredOn >= windowStart && e.incurredOn <= windowEnd ? amount : 0;
  }
  const from = Math.max(monthIndex(e.incurredOn), monthIndex(windowStart));
  // An open-ended subscription is only counted up to the end of the window
  // (never into the future) — projections are computed separately.
  const to = Math.min(monthIndex(e.endedOn ?? windowEnd), monthIndex(windowEnd));
  const months = to - from + 1;
  return months > 0 ? months * amount : 0;
}

/** Rupees per month of currently-active recurring costs — the running burn rate. */
function monthlyRunRate(rows: ExpenseRow[], asOf: Date): number {
  const nowIdx = monthIndex(asOf);
  return rows
    .filter((e) => e.isRecurring && monthIndex(e.incurredOn) <= nowIdx && (!e.endedOn || monthIndex(e.endedOn) >= nowIdx))
    .reduce((s, e) => s + Number(e.amount), 0);
}

export async function listExpenses() {
  const rows = await prisma.developerExpense.findMany({
    where: { isDeleted: false },
    orderBy: [{ isRecurring: 'desc' }, { incurredOn: 'desc' }],
  });

  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  // Everything ever: from the earliest record (or now, if there are none).
  const earliest = rows.reduce<Date>((min, e) => (e.incurredOn < min ? e.incurredOn : min), now);

  const monthly = monthlyRunRate(rows, now);

  return {
    expenses: rows.map((e) => ({
      id: e.id,
      category: e.category,
      label: e.label,
      amount: Number(e.amount),
      isRecurring: e.isRecurring,
      incurredOn: e.incurredOn.toISOString(),
      endedOn: e.endedOn?.toISOString() ?? null,
      notes: e.notes,
      // True when a recurring cost has been stopped — shown greyed out.
      isEnded: !!e.endedOn && monthIndex(e.endedOn) < monthIndex(now),
    })),
    totals: {
      thisYear: rows.reduce((s, e) => s + contributionInWindow(e, yearStart, now), 0),
      allTime: rows.reduce((s, e) => s + contributionInWindow(e, earliest, now), 0),
      /** Active recurring cost per month, and the same annualised. */
      monthlyRunRate: monthly,
      annualRunRate: monthly * 12,
    },
  };
}

export async function createExpense(input: CreateDeveloperExpenseInput, userId: string) {
  return prisma.developerExpense.create({
    data: {
      category: input.category,
      label: input.label,
      amount: input.amount,
      isRecurring: input.isRecurring,
      incurredOn: input.incurredOn,
      endedOn: input.isRecurring ? input.endedOn : undefined,
      notes: input.notes,
      createdById: userId,
    },
  });
}

export async function updateExpense(id: string, input: UpdateDeveloperExpenseInput) {
  const existing = await prisma.developerExpense.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Expense not found');
  return prisma.developerExpense.update({ where: { id }, data: input });
}

export async function deleteExpense(id: string) {
  const existing = await prisma.developerExpense.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Expense not found');
  await prisma.developerExpense.update({ where: { id }, data: { isDeleted: true } });
  return { deleted: true };
}

export const developerExpensesService = { listExpenses, createExpense, updateExpense, deleteExpense };
