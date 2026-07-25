import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireSuperAdmin, requireOwnerOrAdmin } from '../../shared/guards/roleGuard';
import { AppError } from '../../shared/utils/AppError';
import { ok } from '../../shared/utils/apiResponse';
import { dashboardController } from './analytics.controller';
import { analyticsService, scopeOutlet, type TrendPeriod } from './analytics.service';

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

// POS counter analytics. The Main Owner can drill into any one outlet by passing
// ?outletId=<uuid> (omit it for the main-branch till); a franchise owner is always
// pinned to their own outlet and any outletId they pass is ignored — they can
// never see another owner's till.
router.get(
  '/pos',
  requireOwnerOrAdmin,
  validate({
    query: z.object({
      outletId: z.string().uuid().optional(),
      // Plain YYYY-MM-DD — this is a date filter, not a precise instant.
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw AppError.unauthorized();
    const forced = scopeOutlet(req.user); // set only for franchise owners/cashiers
    const outletId = forced !== undefined ? forced : ((req.query.outletId as string | undefined) ?? null);
    const { from, to } = req.query as { from?: string; to?: string };
    return ok(res, await analyticsService.getPosAnalytics(outletId, { from, to }));
  }),
);

export const analyticsRouter = router;
