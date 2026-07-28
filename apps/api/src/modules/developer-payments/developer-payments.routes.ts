import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireDeveloperKey } from '../../shared/guards/developerGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import {
  createDeveloperPaymentSchema, updateDeveloperPaymentSchema,
  type CreateDeveloperPaymentInput, type UpdateDeveloperPaymentInput,
} from './developer-payments.schema';
import { developerPaymentsService } from './developer-payments.service';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();

// Every route here needs the developer passphrase — this ledger (who pays the
// developer, not the shop's own money) must be invisible to every in-app role,
// including SUPER_ADMIN, with no exceptions.
router.use(authGuard, requireDeveloperKey);

const actor = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

router.get('/clients', asyncHandler(async (_req: Request, res: Response) => ok(res, await developerPaymentsService.listClients())));

router.post(
  '/',
  writeRateLimiter,
  validate({ body: createDeveloperPaymentSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    created(res, await developerPaymentsService.createPayment(req.body as CreateDeveloperPaymentInput, actor(req)), 'Payment recorded'),
  ),
);

router.patch(
  '/:id',
  validate({ params: idParam, body: updateDeveloperPaymentSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await developerPaymentsService.updatePayment(req.params.id, req.body as UpdateDeveloperPaymentInput), 'Payment updated'),
  ),
);

router.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await developerPaymentsService.deletePayment(req.params.id), 'Payment removed')),
);

export const developerPaymentsRouter = router;
