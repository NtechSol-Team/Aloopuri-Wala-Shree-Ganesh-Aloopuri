import { Router } from 'express';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireRole } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { ok, created, paginated } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import {
  cashPaymentSchema, createRazorpayOrderSchema, listPaymentsQuerySchema, verifyRazorpaySchema,
  type CashPaymentInput, type CreateRazorpayOrderInput, type ListPaymentsQuery, type VerifyRazorpayInput,
} from './payments.schema';
import { paymentsService } from './payments.service';

const user = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
};

// ── Webhook (no auth; signature-verified). Mounted separately. ───────────────
export const paymentsWebhookRouter = Router();
paymentsWebhookRouter.post(
  '/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers['x-razorpay-signature'];
    if (!req.rawBody || typeof signature !== 'string') throw AppError.badRequest('Missing webhook signature');
    const result = await paymentsService.handleWebhook(req.rawBody, signature, req.body);
    return ok(res, result, 'ok');
  }),
);

// ── Authenticated payment routes ─────────────────────────────────────────────
const router = Router();
router.use(authGuard);

router.get(
  '/',
  validate({ query: listPaymentsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { rows, meta } = await paymentsService.listPayments(user(req), req.query as unknown as ListPaymentsQuery);
    return paginated(res, rows, meta);
  }),
);

router.get('/summary', asyncHandler(async (req: Request, res: Response) => ok(res, await paymentsService.getPaymentSummary(user(req)))));

// Cash entry — main owner or godown manager.
router.post(
  '/cash',
  requireRole(UserRole.SUPER_ADMIN, UserRole.GODOWN_MANAGER),
  writeRateLimiter,
  validate({ body: cashPaymentSchema }),
  asyncHandler(async (req: Request, res: Response) => created(res, await paymentsService.recordCashPayment(req.body as CashPaymentInput, user(req)), 'Cash payment recorded')),
);

// Razorpay — owner (their bills) or admin.
router.post(
  '/razorpay/order',
  requireRole(UserRole.SUPER_ADMIN, UserRole.FRANCHISE_OWNER),
  writeRateLimiter,
  validate({ body: createRazorpayOrderSchema }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await paymentsService.createRazorpayOrder((req.body as CreateRazorpayOrderInput).billId, user(req)), 'Order created')),
);
router.post(
  '/razorpay/verify',
  requireRole(UserRole.SUPER_ADMIN, UserRole.FRANCHISE_OWNER),
  validate({ body: verifyRazorpaySchema }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await paymentsService.verifyRazorpayPayment(req.body as VerifyRazorpayInput, user(req)), 'Payment recorded')),
);

export const paymentsRouter = router;
