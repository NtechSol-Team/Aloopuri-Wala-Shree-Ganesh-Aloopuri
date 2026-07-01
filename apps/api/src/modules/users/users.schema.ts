import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';

export const createUserSchema = z
  .object({
    name: z.string().min(2).max(120),
    email: z.string().email().transform((v) => v.toLowerCase()),
    userId: z.string().min(3).max(40).optional(), // auto-generated if omitted
    password: z.string().min(8, 'Password must be at least 8 characters'),
    phone: z.string().min(7).max(20).optional(),
    role: z.nativeEnum(UserRole),
    outletId: z.string().uuid().optional(),
  })
  .refine(
    (v) => v.role !== UserRole.FRANCHISE_OWNER && v.role !== UserRole.CASHIER ? true : Boolean(v.outletId),
    { message: 'Outlet is required for franchise owners and cashiers', path: ['outletId'] },
  );

export const updateUserSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  phone: z.string().min(7).max(20).nullable().optional(),
  role: z.nativeEnum(UserRole).optional(),
  outletId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const listUsersQuerySchema = paginationQuerySchema.extend({
  role: z.nativeEnum(UserRole).optional(),
  outletId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
  search: z.string().max(120).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
