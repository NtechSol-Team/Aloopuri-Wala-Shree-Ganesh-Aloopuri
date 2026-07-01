import type { UserRole } from '@prisma/client';

/** Standard success envelope: { success, data, message, meta? }. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
  meta?: PaginationMeta;
}

/** Standard error envelope: { success:false, error:{ code, message, field? } }. */
export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    field?: string;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  nextCursor?: string | null;
}

/** Stable machine-readable error codes — never raw strings at throw sites. */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  INSUFFICIENT_STOCK = 'INSUFFICIENT_STOCK',
  INVALID_STATE = 'INVALID_STATE',
  PAYMENT_ERROR = 'PAYMENT_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/** The authenticated principal attached to every protected request. */
export interface AuthUser {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  outletId: string | null;
  sessionId: string;
}

export interface AccessTokenPayload {
  sub: string; // user id
  sid: string; // session id
  role: UserRole;
  outletId: string | null;
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
}
