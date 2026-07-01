import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { verifyAccessToken } from '../utils/jwt';
import { AppError } from '../utils/AppError';
import type { AuthUser } from '../types/api';
import { asyncHandler } from '../utils/asyncHandler';

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Verify the access token, confirm the session is still active (revocable
 * sessions live in PostgreSQL), and attach the principal to req.user.
 */
export const authGuard = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = extractBearer(req);
  if (!token) throw AppError.unauthorized('Missing access token');

  const payload = verifyAccessToken(token);

  const session = await prisma.userSession.findUnique({
    where: { id: payload.sid },
    select: {
      revokedAt: true,
      user: {
        select: { id: true, userId: true, email: true, name: true, role: true, outletId: true, isActive: true, isDeleted: true },
      },
    },
  });

  if (!session || session.revokedAt) throw AppError.unauthorized('Session has been revoked');
  const u = session.user;
  if (!u || u.isDeleted || !u.isActive) throw AppError.unauthorized('Account is inactive');

  const authUser: AuthUser = {
    id: u.id,
    userId: u.userId,
    email: u.email,
    name: u.name,
    role: u.role,
    outletId: u.outletId,
    sessionId: payload.sid,
  };
  req.user = authUser;
  next();
});
