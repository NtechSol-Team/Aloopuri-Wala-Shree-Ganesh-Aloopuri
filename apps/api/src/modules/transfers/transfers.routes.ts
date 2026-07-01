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
import { createTransferSchema, listTransfersQuerySchema, updateTransferStatusSchema } from './transfers.schema';
import type { CreateTransferInput, ListTransfersQuery, UpdateTransferStatusInput } from './transfers.schema';
import { transfersService } from './transfers.service';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();
router.use(authGuard, requireGodownAccess);

const actor = (req: Request): string => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

router.get(
  '/',
  validate({ query: listTransfersQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { rows, meta } = await transfersService.listTransfers(req.query as unknown as ListTransfersQuery);
    return paginated(res, rows, meta);
  }),
);

router.post(
  '/',
  writeRateLimiter,
  validate({ body: createTransferSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    created(res, await transfersService.createTransfer(req.body as CreateTransferInput, actor(req)), 'Transfer created'),
  ),
);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await transfersService.getTransfer(req.params.id))),
);

router.patch(
  '/:id/status',
  validate({ params: idParam, body: updateTransferStatusSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await transfersService.updateStatus(req.params.id, req.body as UpdateTransferStatusInput, actor(req)), 'Transfer updated'),
  ),
);

export const transfersRouter = router;
