import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { ok, paginated } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { listBillsQuerySchema, type ListBillsQuery } from './billing.schema';
import { billingService } from './billing.service';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();
router.use(authGuard);

const user = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
};

router.get(
  '/',
  validate({ query: listBillsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { rows, meta } = await billingService.listBills(user(req), req.query as unknown as ListBillsQuery);
    return paginated(res, rows, meta);
  }),
);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await billingService.getBill(user(req), req.params.id))),
);

router.post(
  '/:id/pdf',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await billingService.regeneratePdf(user(req), req.params.id), 'PDF generation queued')),
);

export const billingRouter = router;
