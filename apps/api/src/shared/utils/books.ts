import { UserRole } from '@prisma/client';
import { AppError } from './AppError';
import type { AuthUser } from '../types/api';

/**
 * Whose books a cost belongs to.
 *
 * Expenses and purchases are kept in two separate sets that never mix:
 *
 *   • `null`  — the business's own (godown / main branch). Every record that
 *     existed before franchises could file their own is in this set, and it is
 *     the only set that feeds company accounting, the P&L and godown stock.
 *   • an outlet id — that branch alone. A franchise owner sees and files only
 *     their own; the main owner never sees them and they never reach the
 *     company P&L. The branch bears the cost.
 *
 * This is deliberate: a franchise's rent and supplies are its own business, not
 * the parent company's. Mixing them would overstate head-office costs and let
 * one branch's spending distort another's figures.
 */
export type BooksScope = { outletId: string | null };

/** The books a user reads from and writes to. Never trust a client-supplied outletId. */
export function booksScopeFor(user: AuthUser): BooksScope {
  if (user.role === UserRole.FRANCHISE_OWNER || user.role === UserRole.CASHIER) {
    if (!user.outletId) throw AppError.forbidden('Your account is not linked to an outlet');
    return { outletId: user.outletId };
  }
  return { outletId: null };
}

/** True when this user keeps a branch's books rather than the company's. */
export function isBranchBooks(user: AuthUser): boolean {
  return user.role === UserRole.FRANCHISE_OWNER || user.role === UserRole.CASHIER;
}
