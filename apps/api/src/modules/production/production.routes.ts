import { Router } from 'express';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireGodownAccess, requireRole } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { listBatchesQuerySchema, listIntakeQuerySchema, logBatchSchema, logIntakeSchema, recordPurchaseSchema } from './production.schema';
import * as c from './production.controller';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();

router.use(authGuard);

// Manufacturing proper — batches, raw-material intake and godown stock — stays
// with the godown manager + super admin.
router.post('/batches', requireGodownAccess, writeRateLimiter, validate({ body: logBatchSchema }), asyncHandler(c.logBatchController));
router.get('/batches', requireGodownAccess, validate({ query: listBatchesQuerySchema }), asyncHandler(c.listBatchesController));
router.get('/batches/:id', requireGodownAccess, validate({ params: idParam }), asyncHandler(c.getBatchController));

router.post('/intake', requireGodownAccess, writeRateLimiter, validate({ body: logIntakeSchema }), asyncHandler(c.logIntakeController));
router.get('/intake', requireGodownAccess, validate({ query: listIntakeQuerySchema }), asyncHandler(c.listIntakeController));

// Purchase bills (multi-line GST goods receipts). A franchise owner may record their
// own branch's purchases; the service scopes every read and write to their outlet and
// rejects any line that would move central stock (see logPurchase).
const purchaseRoles = requireRole(UserRole.SUPER_ADMIN, UserRole.GODOWN_MANAGER, UserRole.FRANCHISE_OWNER);
router.post('/purchases', purchaseRoles, writeRateLimiter, validate({ body: recordPurchaseSchema }), asyncHandler(c.recordPurchaseController));
router.get('/purchases', purchaseRoles, asyncHandler(c.listPurchasesController));
router.get('/purchases/:id', purchaseRoles, validate({ params: idParam }), asyncHandler(c.getPurchaseDetailController));
// Edit fully replaces the bill's lines (reverses old stock/cost effects, re-applies new ones);
// both refuse if the bill already has a payment recorded, or if any of its stock has moved on.
router.patch('/purchases/:id', purchaseRoles, writeRateLimiter, validate({ params: idParam, body: recordPurchaseSchema }), asyncHandler(c.updatePurchaseController));
router.delete('/purchases/:id', purchaseRoles, writeRateLimiter, validate({ params: idParam }), asyncHandler(c.deletePurchaseController));

router.get('/godown-stock', requireGodownAccess, asyncHandler(c.godownStockController));

export const productionRouter = router;
