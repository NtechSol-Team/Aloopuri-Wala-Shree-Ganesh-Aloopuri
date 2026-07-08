import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireRole } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { createOutletSchema, setOutletPricesSchema, updateOutletSchema, type CreateOutletInput, type SetOutletPricesInput, type UpdateOutletInput } from './outlets.schema';
import { outletsService } from './outlets.service';

const idParam = z.object({ id: z.string().uuid() });
const writeRoles = requireRole(UserRole.SUPER_ADMIN, UserRole.GODOWN_MANAGER);
const router = Router();
router.use(authGuard);

const actor = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

// List active outlets — used by inventory, user assignment, order/billing filters.
router.get('/', asyncHandler(async (_req: Request, res: Response) => ok(res, await outletsService.listOutlets())));

router.post(
  '/',
  writeRoles, writeRateLimiter,
  validate({ body: createOutletSchema }),
  asyncHandler(async (req: Request, res: Response) => created(res, await outletsService.createOutlet(req.body as CreateOutletInput, actor(req)), 'Outlet created')),
);

router.get('/:id', validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) => ok(res, await outletsService.getOutlet(req.params.id))));

router.patch(
  '/:id',
  writeRoles,
  validate({ params: idParam, body: updateOutletSchema }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await outletsService.updateOutlet(req.params.id, req.body as UpdateOutletInput), 'Outlet updated')),
);

// Special-price list — only meaningful once the outlet is set to SPECIAL pricing, but
// readable/writable regardless so you can prepare prices before flipping the mode.
router.get(
  '/:id/prices',
  writeRoles,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await outletsService.getOutletPrices(req.params.id))),
);
router.put(
  '/:id/prices',
  writeRoles,
  validate({ params: idParam, body: setOutletPricesSchema }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await outletsService.setOutletPrices(req.params.id, req.body as SetOutletPricesInput), 'Special prices saved')),
);

export const outletsRouter = router;
