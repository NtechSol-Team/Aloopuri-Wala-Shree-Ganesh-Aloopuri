import { addYears } from 'date-fns';
import { DeveloperPaymentScope } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/utils/AppError';
import type { CreateDeveloperPaymentInput, UpdateDeveloperPaymentInput } from './developer-payments.schema';

const DUE_SOON_DAYS = 30;
const MAIN_ADMIN_LABEL = 'Main Admin / Business';

export type RenewalStatus = 'NEVER_PAID' | 'OVERDUE' | 'DUE_SOON' | 'OK';

function statusFor(renewalDate: Date | null, now: Date): RenewalStatus {
  if (!renewalDate) return 'NEVER_PAID';
  const daysLeft = Math.ceil((renewalDate.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft < 0) return 'OVERDUE';
  if (daysLeft <= DUE_SOON_DAYS) return 'DUE_SOON';
  return 'OK';
}

/**
 * Every payer this developer tracks (the whole business "Main Admin", plus one
 * row per outlet/franchise) with their latest payment + renewal status, and
 * full history for the drill-down. Small, unpaginated dataset by design — this
 * is a solo developer's own bookkeeping, not a customer-facing report.
 */
export async function listClients() {
  const [outlets, payments] = await Promise.all([
    prisma.outlet.findMany({ where: { isDeleted: false }, orderBy: { name: 'asc' }, select: { id: true, name: true, isActive: true } }),
    prisma.developerPayment.findMany({ where: { isDeleted: false }, orderBy: { paidOn: 'desc' } }),
  ]);

  const now = new Date();
  const byOutlet = new Map<string, typeof payments>();
  const mainAdmin: typeof payments = [];
  for (const p of payments) {
    if (p.scope === DeveloperPaymentScope.MAIN_ADMIN) { mainAdmin.push(p); continue; }
    if (!p.outletId) continue;
    const list = byOutlet.get(p.outletId) ?? [];
    list.push(p);
    byOutlet.set(p.outletId, list);
  }

  const toClient = (
    scope: DeveloperPaymentScope,
    outletId: string | null,
    name: string,
    isActive: boolean,
    history: typeof payments,
  ) => {
    const latest = history[0] ?? null;
    return {
      scope,
      outletId,
      name,
      isActive,
      lastPayment: latest && { id: latest.id, amount: latest.amount, method: latest.method, paidOn: latest.paidOn, renewalDate: latest.renewalDate, notes: latest.notes },
      status: statusFor(latest?.renewalDate ?? null, now),
      daysUntilRenewal: latest ? Math.ceil((latest.renewalDate.getTime() - now.getTime()) / 86_400_000) : null,
      history: history.map((p) => ({ id: p.id, amount: p.amount, method: p.method, paidOn: p.paidOn, renewalDate: p.renewalDate, notes: p.notes })),
    };
  };

  const clients = [
    toClient(DeveloperPaymentScope.MAIN_ADMIN, null, MAIN_ADMIN_LABEL, true, mainAdmin),
    ...outlets.map((o) => toClient(DeveloperPaymentScope.OUTLET, o.id, o.name, o.isActive, byOutlet.get(o.id) ?? [])),
  ];

  // Most urgent first: overdue, then due-soon (soonest first), then ok, then never-paid.
  const rank: Record<RenewalStatus, number> = { OVERDUE: 0, DUE_SOON: 1, OK: 2, NEVER_PAID: 3 };
  clients.sort((a, b) => rank[a.status] - rank[b.status] || (a.daysUntilRenewal ?? 0) - (b.daysUntilRenewal ?? 0));

  return clients;
}

export async function createPayment(input: CreateDeveloperPaymentInput, userId: string) {
  if (input.scope === DeveloperPaymentScope.OUTLET) {
    const outlet = await prisma.outlet.findFirst({ where: { id: input.outletId, isDeleted: false }, select: { id: true } });
    if (!outlet) throw AppError.badRequest('Outlet not found');
  }
  const renewalDate = input.renewalDate ?? addYears(input.paidOn, 1);
  return prisma.developerPayment.create({
    data: {
      scope: input.scope,
      outletId: input.scope === DeveloperPaymentScope.OUTLET ? input.outletId : undefined,
      amount: input.amount,
      method: input.method,
      paidOn: input.paidOn,
      renewalDate,
      notes: input.notes,
      createdById: userId,
    },
  });
}

export async function updatePayment(id: string, input: UpdateDeveloperPaymentInput) {
  const existing = await prisma.developerPayment.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Payment record not found');
  return prisma.developerPayment.update({ where: { id }, data: input });
}

export async function deletePayment(id: string) {
  const existing = await prisma.developerPayment.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Payment record not found');
  await prisma.developerPayment.update({ where: { id }, data: { isDeleted: true } });
  return { deleted: true };
}

export const developerPaymentsService = { listClients, createPayment, updatePayment, deletePayment };
