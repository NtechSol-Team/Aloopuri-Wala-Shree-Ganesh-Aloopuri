import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireGodownAccess } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { listBatchesQuerySchema, listIntakeQuerySchema, logBatchSchema, logIntakeSchema, recordPurchaseSchema } from './production.schema';
import * as c from './production.controller';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();

// Production is restricted to godown manager + super admin.
router.use(authGuard, requireGodownAccess);

router.post('/batches', writeRateLimiter, validate({ body: logBatchSchema }), asyncHandler(c.logBatchController));
router.get('/batches', validate({ query: listBatchesQuerySchema }), asyncHandler(c.listBatchesController));
router.get('/batches/:id', validate({ params: idParam }), asyncHandler(c.getBatchController));

router.post('/intake', writeRateLimiter, validate({ body: logIntakeSchema }), asyncHandler(c.logIntakeController));
router.get('/intake', validate({ query: listIntakeQuerySchema }), asyncHandler(c.listIntakeController));

// Purchase bills (multi-line GST goods receipts)
router.post('/purchases', writeRateLimiter, validate({ body: recordPurchaseSchema }), asyncHandler(c.recordPurchaseController));
router.get('/purchases', asyncHandler(c.listPurchasesController));
router.get('/purchases/:id', validate({ params: idParam }), asyncHandler(c.getPurchaseDetailController));

router.get('/godown-stock', asyncHandler(c.godownStockController));

export const productionRouter = router;
