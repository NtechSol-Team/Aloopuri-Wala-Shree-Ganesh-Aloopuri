import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireGodownAccess } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok, paginated } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { listPayablesQuerySchema, paySupplierSchema, type ListPayablesQuery, type PaySupplierInput } from './payables.schema';
import { payablesService } from './payables.service';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();
router.use(authGuard, requireGodownAccess); // owner + godown manager

const actor = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

router.get('/summary', asyncHandler(async (_req: Request, res: Response) => ok(res, await payablesService.getPayablesSummary())));
router.get('/', validate({ query: listPayablesQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { rows, meta } = await payablesService.listPayables(req.query as unknown as ListPayablesQuery);
  return paginated(res, rows, meta);
}));
router.get('/:id', validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) => ok(res, await payablesService.getPayable(req.params.id))));
router.post('/:id/pay', writeRateLimiter, validate({ params: idParam, body: paySupplierSchema }), asyncHandler(async (req: Request, res: Response) =>
  created(res, await payablesService.paySupplier(req.params.id, req.body as PaySupplierInput, actor(req)), 'Supplier payment recorded'),
));

export const payablesRouter = router;
