import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireGodownAccess } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { createUnitSchema, updateUnitSchema, type CreateUnitInput, type UpdateUnitInput } from './units.schema';
import { unitsService } from './units.service';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();

// Every role needs to *read* units (a unit's decimal precision drives quantity entry
// on POS/orders/inventory screens); only godown + owner maintain the master itself.
router.use(authGuard);

const actor = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

router.get('/', asyncHandler(async (_req: Request, res: Response) => ok(res, await unitsService.listUnits())));

router.post(
  '/',
  requireGodownAccess,
  writeRateLimiter,
  validate({ body: createUnitSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    created(res, await unitsService.createUnit(req.body as CreateUnitInput, actor(req)), 'Unit created'),
  ),
);

router.patch(
  '/:id',
  requireGodownAccess,
  validate({ params: idParam, body: updateUnitSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await unitsService.updateUnit(req.params.id, req.body as UpdateUnitInput), 'Unit updated'),
  ),
);

router.delete(
  '/:id',
  requireGodownAccess,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await unitsService.deleteUnit(req.params.id), 'Unit deleted')),
);

export const unitsRouter = router;
