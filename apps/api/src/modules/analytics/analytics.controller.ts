import type { Request, Response } from 'express';
import { ok } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { analyticsService } from './analytics.service';

export async function dashboardController(req: Request, res: Response): Promise<Response> {
  if (!req.user) throw AppError.unauthorized();
  const kpis = await analyticsService.getDashboard(req.user);
  return ok(res, kpis, 'OK');
}
