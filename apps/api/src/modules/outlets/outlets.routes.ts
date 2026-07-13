import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireRole } from '../../shared/guards/roleGuard';
import { requireDeveloperKey } from '../../shared/guards/developerGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { createOutletSchema, setOutletPricesSchema, updateOutletSchema, type CreateOutletInput, type SetOutletPricesInput, type UpdateOutletInput } from './outlets.schema';
import { outletsService } from './outlets.service';

const idParam = z.object({ id: z.string().uuid() });
// Reading is role-based (order confirmation pre-fills special prices); creating/editing
// outlets & their prices is locked behind the hidden, passphrase-gated developer window.
const readPriceRoles = requireRole(UserRole.SUPER_ADMIN, UserRole.GODOWN_MANAGER);
const router = Router();
router.use(authGuard);

const actor = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

// Unlock check for the developer window — 200 if the x-developer-key header is valid.
router.post('/dev/verify', requireDeveloperKey, asyncHandler(async (_req: Request, res: Response) => ok(res, { unlocked: true }, 'Developer access granted')));

// List active outlets — used by inventory, user assignment, order/billing filters.
router.get('/', asyncHandler(async (_req: Request, res: Response) => ok(res, await outletsService.listOutlets())));

router.post(
  '/',
  requireDeveloperKey, writeRateLimiter,
  validate({ body: createOutletSchema }),
  asyncHandler(async (req: Request, res: Response) => created(res, await outletsService.createOutlet(req.body as CreateOutletInput, actor(req)), 'Outlet created')),
);

router.get('/:id', validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) => ok(res, await outletsService.getOutlet(req.params.id))));

router.patch(
  '/:id',
  requireDeveloperKey,
  validate({ params: idParam, body: updateOutletSchema }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await outletsService.updateOutlet(req.params.id, req.body as UpdateOutletInput), 'Outlet updated')),
);

// Special-price list — only meaningful once the outlet is set to SPECIAL pricing, but
// readable/writable regardless so you can prepare prices before flipping the mode.
// Read stays role-based so order confirmation can pre-fill; writes require the dev key.
router.get(
  '/:id/prices',
  readPriceRoles,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await outletsService.getOutletPrices(req.params.id))),
);
router.put(
  '/:id/prices',
  requireDeveloperKey,
  validate({ params: idParam, body: setOutletPricesSchema }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await outletsService.setOutletPrices(req.params.id, req.body as SetOutletPricesInput), 'Special prices saved')),
);

export const outletsRouter = router;
