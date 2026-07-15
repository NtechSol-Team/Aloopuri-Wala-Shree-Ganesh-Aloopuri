import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/auth.store';
import type { ApiErrorBody, ApiSuccess, Tokens } from '@/types/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const API_BASE = `${API_URL}/api/v1`;

export const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request: attach the access token ─────────────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;

  // File uploads send FormData. The instance defaults Content-Type to
  // application/json, which would clobber the multipart boundary the browser
  // needs to set — leaving the server unable to parse the body, so the file
  // never arrives ("attach a file" even though one was). Drop the header and let
  // the browser fill in `multipart/form-data; boundary=…` itself.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// ── Response: transparent refresh-token rotation on 401 ──────────────────────
let refreshing: Promise<string | null> | null = null;

async function runRefresh(): Promise<string | null> {
  const { refreshToken, setTokens, clear } = useAuthStore.getState();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post<ApiSuccess<Tokens>>(`${API_BASE}/auth/refresh`, { refreshToken });
    setTokens({ accessToken: data.data.accessToken, refreshToken: data.data.refreshToken });
    return data.data.accessToken;
  } catch {
    clear();
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<ApiErrorBody>) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;

    if (status === 401 && original && !original._retried && !original.url?.includes('/auth/')) {
      original._retried = true;
      refreshing = refreshing ?? runRefresh();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers = { ...original.headers, Authorization: `Bearer ${newToken}` };
        return api(original);
      }
    }
    return Promise.reject(error);
  },
);

/** Normalise an axios error into a user-facing message. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined;
    return body?.error?.message ?? err.message ?? fallback;
  }
  return fallback;
}
