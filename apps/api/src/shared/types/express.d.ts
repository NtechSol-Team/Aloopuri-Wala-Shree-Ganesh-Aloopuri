import type { AuthUser } from './api';

// Augment Express Request with the authenticated principal set by authGuard.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      rawBody?: Buffer;
    }
  }
}

export {};
