import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/utils/AppError';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import type { CreateContactInput, ListContactsQuery, UpdateContactInput } from './contacts.schema';

function clean<T extends Record<string, unknown>>(input: T): T {
  // Drop empty-string email so it doesn't violate anything downstream.
  if (input.email === '') delete (input as Record<string, unknown>).email;
  return input;
}

export async function listContacts(query: ListContactsQuery) {
  const where: Prisma.ContactWhereInput = {
    isDeleted: false,
    ...(query.type ? { type: query.type } : {}),
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { gstin: { contains: query.search, mode: 'insensitive' } }, { phone: { contains: query.search } }, { whatsapp: { contains: query.search } }] }
      : {}),
  };
  const { skip, take } = toSkipTake(query);
  const [rows, total] = await Promise.all([
    prisma.contact.findMany({ where, orderBy: { name: 'asc' }, skip, take }),
    prisma.contact.count({ where }),
  ]);
  return { rows, meta: buildPaginationMeta(query, total) };
}

export async function createContact(input: CreateContactInput, createdById: string) {
  return prisma.contact.create({ data: { ...clean(input), createdById } });
}

export async function updateContact(id: string, input: UpdateContactInput) {
  const existing = await prisma.contact.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Contact not found');
  return prisma.contact.update({ where: { id }, data: clean(input) });
}

export async function deleteContact(id: string) {
  const existing = await prisma.contact.findFirst({ where: { id, isDeleted: false } });
  if (!existing) throw AppError.notFound('Contact not found');
  await prisma.contact.update({ where: { id }, data: { isDeleted: true, isActive: false } });
  return { deleted: true };
}

export const contactsService = { listContacts, createContact, updateContact, deleteContact };
