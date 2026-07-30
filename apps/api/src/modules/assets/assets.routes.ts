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
import {
  createAssetSchema, listAssetsQuerySchema, updateAssetSchema,
  type CreateAssetInput, type ListAssetsQuery, type UpdateAssetInput,
} from './assets.schema';
import { assetsService } from './assets.service';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();

// Assets are created as a side effect of purchases, so the same people who record
// purchases (owner + godown) manage the register.
router.use(authGuard, requireGodownAccess);

const actor = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

router.get(
  '/',
  validate({ query: listAssetsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { rows, meta, totalValue } = await assetsService.listAssets(req.query as unknown as ListAssetsQuery);
    return paginated(res, rows, { ...meta, totalValue } as typeof meta & { totalValue: number });
  }),
);

router.post(
  '/',
  writeRateLimiter,
  validate({ body: createAssetSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    created(res, await assetsService.createAsset(req.body as CreateAssetInput, actor(req)), 'Asset added'),
  ),
);

router.patch(
  '/:id',
  validate({ params: idParam, body: updateAssetSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await assetsService.updateAsset(req.params.id, req.body as UpdateAssetInput), 'Asset updated'),
  ),
);

router.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await assetsService.deleteAsset(req.params.id), 'Asset removed')),
);

export const assetsRouter = router;
