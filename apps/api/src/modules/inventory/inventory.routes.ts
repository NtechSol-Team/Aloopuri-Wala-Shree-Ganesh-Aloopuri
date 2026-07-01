import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireGodownAccess } from '../../shared/guards/roleGuard';
import { ok } from '../../shared/utils/apiResponse';
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

export const inventoryRouter = router;
