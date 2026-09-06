import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireRole, requireSuperAdmin } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { ok, created, paginated } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import {
  cashPaymentSchema, createRazorpayOrderSchema, listPaymentsQuerySchema, verifyRazorpaySchema,
  outstandingBillsQuerySchema, receivePaymentPreviewSchema, receivePaymentSchema, outletPaymentHistoryQuerySchema,
  type CashPaymentInput, type CreateRazorpayOrderInput, type ListPaymentsQuery, type VerifyRazorpayInput,
  type OutstandingBillsQuery, type ReceivePaymentPreviewInput, type ReceivePaymentInput, type OutletPaymentHistoryQuery,
} from './payments.schema';
import { paymentsService } from './payments.service';

const idParam = z.object({ id: z.string().uuid() });

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

// Reverse a payment entered by mistake — main owner only. Re-derives the bill's
// paid/due/status from what's actually left rather than just subtracting.
router.delete(
  '/:id',
  requireSuperAdmin,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await paymentsService.deletePayment(req.params.id), 'Payment reversed')),
);

// ── Receive Payment (FIFO across an outlet's outstanding bills) ─────────────
// Collecting money from a franchise is a main-office job, same roster as cash entry.
const receivePaymentRoles = requireRole(UserRole.SUPER_ADMIN, UserRole.GODOWN_MANAGER);

router.get(
  '/receive/outstanding',
  receivePaymentRoles,
  validate({ query: outstandingBillsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await paymentsService.getOutstandingBills((req.query as unknown as OutstandingBillsQuery).outletId))),
);

router.get(
  '/receive/history',
  receivePaymentRoles,
  validate({ query: outletPaymentHistoryQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await paymentsService.getOutletPaymentHistory((req.query as unknown as OutletPaymentHistoryQuery).outletId))),
);

router.post(
  '/receive/preview',
  receivePaymentRoles,
  validate({ body: receivePaymentPreviewSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { outletId, amount } = req.body as ReceivePaymentPreviewInput;
    return ok(res, await paymentsService.previewReceivePayment(outletId, amount));
  }),
);

router.post(
  '/receive',
  receivePaymentRoles,
  writeRateLimiter,
  validate({ body: receivePaymentSchema }),
  asyncHandler(async (req: Request, res: Response) => created(res, await paymentsService.receivePayment(req.body as ReceivePaymentInput, user(req)), 'Payment received')),
);

export const paymentsRouter = router;
