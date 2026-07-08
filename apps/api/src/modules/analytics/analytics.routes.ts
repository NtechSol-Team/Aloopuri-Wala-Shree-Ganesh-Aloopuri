import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireSuperAdmin } from '../../shared/guards/roleGuard';
import { ok } from '../../shared/utils/apiResponse';
import { dashboardController } from './analytics.controller';
import { analyticsService, type TrendPeriod } from './analytics.service';

const router = Router();
router.use(authGuard);

// Dashboard KPIs — any authenticated user (outlet-scoped inside the service).
router.get('/dashboard', asyncHandler(dashboardController));

// Reporting analytics — super admin only.
router.get(
  '/sales/trend',
  requireSuperAdmin,
  validate({ query: z.object({ period: z.enum(['daily', 'weekly', 'monthly']).default('monthly') }) }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await analyticsService.getRevenueTrend(req.query.period as TrendPeriod))),
);
router.get('/sales/top-products', requireSuperAdmin, asyncHandler(async (_req: Request, res: Response) => ok(res, await analyticsService.getTopProducts())));
router.get('/financial', requireSuperAdmin, asyncHandler(async (_req: Request, res: Response) => ok(res, await analyticsService.getFinancial())));
router.get('/outlets', requireSuperAdmin, asyncHandler(async (_req: Request, res: Response) => ok(res, await analyticsService.getOutletPerformance())));
router.get(
  '/outlets/:outletId',
  requireSuperAdmin,
  validate({ params: z.object({ outletId: z.string().uuid() }) }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await analyticsService.getOutletDetail(req.params.outletId))),
);
router.get('/inventory', requireSuperAdmin, asyncHandler(async (_req: Request, res: Response) => ok(res, await analyticsService.getInventoryAnalytics())));
router.get('/pos', requireSuperAdmin, asyncHandler(async (_req: Request, res: Response) => ok(res, await analyticsService.getPosAnalytics())));

export const analyticsRouter = router;
