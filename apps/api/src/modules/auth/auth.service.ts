import type { User } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError } from '../../shared/utils/AppError';
import { verifyPassword } from '../../shared/utils/password';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  ttlToDate,
  verifyRefreshToken,
} from '../../shared/utils/jwt';
import type { AuthUser } from '../../shared/types/api';

export interface AuthContext {
  ipAddress?: string;
  userAgent?: string;
  deviceName?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: PublicUser;
}

export interface PublicUser {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: User['role'];
  outletId: string | null;
  phone: string | null;
}

function toPublicUser(u: User): PublicUser {
  return {
    id: u.id,
    userId: u.userId,
    email: u.email,
    name: u.name,
    role: u.role,
    outletId: u.outletId,
    phone: u.phone,
  };
}

async function issueTokensForSession(params: {
  userId: string;
  sessionId: string;
  role: User['role'];
  outletId: string | null;
}): Promise<AuthTokens> {
  const accessToken = signAccessToken({
    sub: params.userId,
    sid: params.sessionId,
    role: params.role,
    outletId: params.outletId,
  });
  const refreshToken = signRefreshToken({ sub: params.userId, sid: params.sessionId });
  return { accessToken, refreshToken };
}

/** Authenticate by email OR user code, create a session, return tokens. */
export async function login(
  identifier: string,
  password: string,
  ctx: AuthContext,
): Promise<AuthResult> {
  const user = await prisma.user.findFirst({
    where: {
      isDeleted: false,
      OR: [{ email: identifier.toLowerCase() }, { userId: identifier }],
    },
  });

  // Constant-ish failure response — do not reveal which part was wrong.
  if (!user) throw AppError.unauthorized('Invalid credentials');
  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) throw AppError.unauthorized('Invalid credentials');
  if (!user.isActive) throw AppError.forbidden('Your account has been deactivated');

  const refreshExpiresAt = ttlToDate(env.JWT_REFRESH_TTL);
  // Create the session first to obtain its id, then sign tokens bound to it.
  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      refreshTokenHash: '', // placeholder, set below after signing
      deviceName: ctx.deviceName,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      expiresAt: refreshExpiresAt,
    },
  });

  const tokens = await issueTokensForSession({
    userId: user.id,
    sessionId: session.id,
    role: user.role,
    outletId: user.outletId,
  });
  await prisma.userSession.update({
    where: { id: session.id },
    data: { refreshTokenHash: hashToken(tokens.refreshToken) },
  });

  return { ...tokens, user: toPublicUser(user) };
}

/**
 * Rotate tokens. Detects refresh-token reuse: if the presented token's hash
 * doesn't match the stored one, the session is revoked (possible theft).
 */
export async function refresh(refreshToken: string): Promise<AuthTokens> {
  const payload = verifyRefreshToken(refreshToken);

  const session = await prisma.userSession.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });
  if (!session || session.revokedAt) throw AppError.unauthorized('Session is no longer valid');
  if (session.expiresAt < new Date()) throw AppError.unauthorized('Session has expired');

  const presentedHash = hashToken(refreshToken);
  if (presentedHash !== session.refreshTokenHash) {
    // Reuse of an old/rotated token → revoke the whole session.
    await prisma.userSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    throw AppError.unauthorized('Refresh token reuse detected — please sign in again');
  }
  if (!session.user.isActive || session.user.isDeleted) {
    throw AppError.forbidden('Account is inactive');
  }

  const tokens = await issueTokensForSession({
    userId: session.user.id,
    sessionId: session.id,
    role: session.user.role,
    outletId: session.user.outletId,
  });
  await prisma.userSession.update({
    where: { id: session.id },
    data: { refreshTokenHash: hashToken(tokens.refreshToken), lastActiveAt: new Date() },
  });

  return tokens;
}

/** Revoke the current session (logout). */
export async function logout(sessionId: string): Promise<void> {
  await prisma.userSession.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.isDeleted) throw AppError.notFound('User not found');
  return toPublicUser(user);
}

export async function listSessions(userId: string) {
  const sessions = await prisma.userSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastActiveAt: 'desc' },
    select: {
      id: true,
      deviceName: true,
      ipAddress: true,
      userAgent: true,
      lastActiveAt: true,
      createdAt: true,
    },
  });
  return sessions;
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const result = await prisma.userSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (result.count === 0) throw AppError.notFound('Session not found');
}

export const authService = {
  login,
  refresh,
  logout,
  getCurrentUser,
  listSessions,
  revokeSession,
};

export type { AuthUser };
