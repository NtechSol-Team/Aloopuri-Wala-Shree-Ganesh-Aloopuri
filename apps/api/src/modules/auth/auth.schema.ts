import { z } from 'zod';

export const loginSchema = z.object({
  // Single field: email address OR user code (e.g. EMP001).
  identifier: z.string().min(3, 'Enter your email or user ID'),
  password: z.string().min(1, 'Password is required'),
  deviceName: z.string().max(120).optional(),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10, 'Refresh token is required'),
});

export const revokeSessionSchema = z.object({
  sessionId: z.string().uuid(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
