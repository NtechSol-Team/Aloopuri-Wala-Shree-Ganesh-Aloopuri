import type { NextFunction, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { AppError } from '../utils/AppError';

/** Restrict a route to one or more roles. Must run after authGuard. */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(AppError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(AppError.forbidden(`Requires one of: ${roles.join(', ')}`));
      return;
    }
    next();
  };
}

export const requireSuperAdmin = requireRole(UserRole.SUPER_ADMIN);
export const requireOwnerOrAdmin = requireRole(UserRole.SUPER_ADMIN, UserRole.FRANCHISE_OWNER);
export const requireGodownAccess = requireRole(UserRole.SUPER_ADMIN, UserRole.GODOWN_MANAGER);

/**
 * Ensure the requester may act on a given outlet: super admin can touch any
 * outlet; outlet-scoped users only their own.
 */
export function assertOutletAccess(req: Request, outletId: string): void {
  if (!req.user) throw AppError.unauthorized();
  if (req.user.role === UserRole.SUPER_ADMIN) return;
  if (req.user.outletId !== outletId) {
    throw AppError.forbidden('You can only access your own outlet');
  }
}
