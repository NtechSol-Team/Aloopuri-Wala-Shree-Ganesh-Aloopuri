import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../shared/utils/AppError';
import { hashPassword } from '../../shared/utils/password';
import { nextDocNumber } from '../../shared/utils/docNumber';
import { buildPaginationMeta, toSkipTake } from '../../shared/utils/pagination';
import type { CreateUserInput, ListUsersQuery, UpdateUserInput } from './users.schema';

const publicSelect = {
  id: true,
  userId: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  outletId: true,
  isActive: true,
  createdAt: true,
  outlet: { select: { id: true, name: true, code: true } },
} satisfies Prisma.UserSelect;

export async function createUser(input: CreateUserInput, createdById: string) {
  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const userCode = input.userId ?? (await nextDocNumber(tx, 'USER_CODE'));

    // Pre-check uniqueness for friendly errors (DB still enforces).
    const existing = await tx.user.findFirst({
      where: { OR: [{ email: input.email }, { userId: userCode }] },
      select: { email: true, userId: true },
    });
    if (existing?.email === input.email) throw AppError.conflict('Email already in use', 'email');
    if (existing?.userId === userCode) throw AppError.conflict('User ID already in use', 'userId');

    return tx.user.create({
      data: {
        userId: userCode,
        email: input.email,
        name: input.name,
        phone: input.phone,
        role: input.role,
        outletId: input.outletId,
        passwordHash,
        createdById,
      },
      select: publicSelect,
    });
  });
}

export async function listUsers(query: ListUsersQuery) {
  const where: Prisma.UserWhereInput = {
    isDeleted: false,
    ...(query.role ? { role: query.role } : {}),
    ...(query.outletId ? { outletId: query.outletId } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { email: { contains: query.search, mode: 'insensitive' } },
            { userId: { contains: query.search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const { skip, take } = toSkipTake(query);
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, select: publicSelect, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.user.count({ where }),
  ]);
  return { rows, meta: buildPaginationMeta(query, total) };
}

export async function getUser(id: string) {
  const user = await prisma.user.findFirst({ where: { id, isDeleted: false }, select: publicSelect });
  if (!user) throw AppError.notFound('User not found');
  return user;
}

export async function updateUser(id: string, input: UpdateUserInput) {
  await getUser(id);
  return prisma.user.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.outletId !== undefined ? { outletId: input.outletId } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
    select: publicSelect,
  });
}

export async function deactivateUser(id: string, actingUserId: string) {
  if (id === actingUserId) throw AppError.badRequest('You cannot deactivate your own account');
  await getUser(id);
  // Deactivate and revoke all active sessions.
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { isActive: false } }),
    prisma.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return { deactivated: true };
}

export async function resetPassword(id: string, newPassword: string) {
  await getUser(id);
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id }, data: { passwordHash } }),
    // Force re-login everywhere after a password reset.
    prisma.userSession.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return { reset: true };
}

export const usersService = {
  createUser,
  listUsers,
  getUser,
  updateUser,
  deactivateUser,
  resetPassword,
};
