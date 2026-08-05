import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireGodownAccess } from '../../shared/guards/roleGuard';
import { ok } from '../../shared/utils/apiResponse';
import { istDate } from '../../shared/utils/date';
import { inventoryService } from './inventory.service';

const router = Router();
router.use(authGuard, requireGodownAccess);

router.get('/summary', asyncHandler(async (_req: Request, res: Response) => ok(res, await inventoryService.getSummary())));
router.get('/godown', asyncHandler(async (_req: Request, res: Response) => ok(res, await inventoryService.getGodown())));
router.get('/main-branch', asyncHandler(async (_req: Request, res: Response) => ok(res, await inventoryService.getMainBranch())));
router.get(
  '/outlet/:outletId',
  validate({ params: z.object({ outletId: z.string().uuid() }) }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await inventoryService.getOutlet(req.params.outletId))),
);

const movementsQuery = z.object({
  productId: z.string().uuid().optional(),
  outletId: z.string().uuid().optional(),
  from: istDate.optional(),
  to: istDate.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

router.get(
  '/movements',
  validate({ query: movementsQuery }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await inventoryService.getMovements(req.query as unknown as z.infer<typeof movementsQuery>)),
  ),
);

export const inventoryRouter = router;
