import type { Request, Response } from 'express';
import { ok } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { authService } from './auth.service';
import type { LoginInput, RefreshInput } from './auth.schema';

function clientContext(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

export async function loginController(req: Request, res: Response): Promise<Response> {
  const body = req.body as LoginInput;
  const result = await authService.login(body.identifier, body.password, {
    ...clientContext(req),
    deviceName: body.deviceName,
  });
  return ok(res, result, 'Signed in successfully');
}

export async function refreshController(req: Request, res: Response): Promise<Response> {
  const body = req.body as RefreshInput;
  const tokens = await authService.refresh(body.refreshToken);
  return ok(res, tokens, 'Token refreshed');
}

export async function logoutController(req: Request, res: Response): Promise<Response> {
  if (!req.user) throw AppError.unauthorized();
  await authService.logout(req.user.sessionId);
  return ok(res, { loggedOut: true }, 'Signed out');
}

export async function meController(req: Request, res: Response): Promise<Response> {
  if (!req.user) throw AppError.unauthorized();
  const user = await authService.getCurrentUser(req.user.id);
  return ok(res, user, 'OK');
}

export async function listSessionsController(req: Request, res: Response): Promise<Response> {
  if (!req.user) throw AppError.unauthorized();
  const sessions = await authService.listSessions(req.user.id);
  return ok(res, sessions, 'OK');
}

export async function revokeSessionController(req: Request, res: Response): Promise<Response> {
  if (!req.user) throw AppError.unauthorized();
  await authService.revokeSession(req.user.id, req.params.sessionId);
  return ok(res, { revoked: true }, 'Session revoked');
}
