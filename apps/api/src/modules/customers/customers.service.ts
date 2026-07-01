import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/utils/AppError';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import type { CreateCustomerInput, ListCustomersQuery, UpdateCustomerInput } from './customers.schema';

function clean<T extends Record<string, unknown>>(input: T): T {
  // Drop empty-string email so it doesn't violate anything downstream.
  if (input.email === '') delete (input as Record<string, unknown>).email;
  return input;
}

export async function listCustomers(query: ListCustomersQuery) {
  const where: Prisma.CustomerWhereInput = {
    isDeleted: false,
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { gstin: { contains: query.search, mode: 'insensitive' } }, { phone: { contains: query.search } }] }
      : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [rows, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
    prisma.customer.count({ where }),
  ]);
  return { rows, meta: buildPaginationMeta(query, total) };
}

export async function createCustomer(input: CreateCustomerInput, createdById: string) {
  return prisma.customer.create({ data: { ...clean(input), createdById } });
}

export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  const existing = await prisma.customer.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Customer not found');
  return prisma.customer.update({ where: { id }, data: clean(input) });
}

export async function deleteCustomer(id: string) {
  const existing = await prisma.customer.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Customer not found');
  await prisma.customer.update({ where: { id }, data: { isDeleted: true, isActive: false } });
  return { deleted: true };
}

export const customersService = { listCustomers, createCustomer, updateCustomer, deleteCustomer };
