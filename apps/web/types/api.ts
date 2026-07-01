export type UserRole = 'SUPER_ADMIN' | 'GODOWN_MANAGER' | 'FRANCHISE_OWNER' | 'CASHIER';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message: string;
  meta?: PaginationMeta;
}

export interface ApiErrorBody {
  success: false;
  error: { code: string; message: string; field?: string };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  nextCursor?: string | null;
}

export interface AuthUser {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  outletId: string | null;
  phone?: string | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}
