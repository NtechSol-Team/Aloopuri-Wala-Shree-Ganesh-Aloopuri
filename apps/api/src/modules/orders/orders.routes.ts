import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireRole, requireSuperAdmin } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok, paginated } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { UserRole } from '@prisma/client';
import {
  approveOrderSchema, createOrderSchema, dispatchOrderSchema, listOrdersQuerySchema,
  rejectOrderSchema, verifyOrderPaymentSchema,
} from './orders.schema';
import type {
  ApproveOrderInput, CreateOrderInput, DispatchOrderInput, ListOrdersQuery,
  RejectOrderInput, VerifyOrderPaymentInput,
} from './orders.schema';
import { ordersService } from './orders.service';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();
router.use(authGuard);

const user = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
};

router.get(
  '/',
  validate({ query: listOrdersQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { rows, meta } = await ordersService.listOrders(user(req), req.query as unknown as ListOrdersQuery);
    return paginated(res, rows, meta);
  }),
);

router.post(
  '/',
  requireRole(UserRole.FRANCHISE_OWNER, UserRole.SUPER_ADMIN),
  writeRateLimiter,
  validate({ body: createOrderSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    created(res, await ordersService.createOrder(user(req), req.body as CreateOrderInput), 'Order placed — choose how to pay'),
  ),
);

router.get('/:id', validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) => ok(res, await ordersService.getOrder(user(req), req.params.id))));

// ── Outlet: settle the order ─────────────────────────────────────────────────
router.post(
  '/:id/credit',
  requireRole(UserRole.FRANCHISE_OWNER, UserRole.SUPER_ADMIN),
  writeRateLimiter,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await ordersService.requestCredit(user(req), req.params.id), 'Sent to the main owner for credit approval'),
  ),
);

router.post(
  '/:id/razorpay/order',
  requireRole(UserRole.FRANCHISE_OWNER, UserRole.SUPER_ADMIN),
  writeRateLimiter,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await ordersService.createOrderPaymentIntent(user(req), req.params.id))),
);

router.post(
  '/:id/razorpay/verify',
  requireRole(UserRole.FRANCHISE_OWNER, UserRole.SUPER_ADMIN),
  validate({ params: idParam, body: verifyOrderPaymentSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await ordersService.verifyOrderPayment(user(req), req.params.id, req.body as VerifyOrderPaymentInput), 'Payment successful — order confirmed'),
  ),
);

// ── Main owner: credit approval ──────────────────────────────────────────────
router.post(
  '/:id/approve',
  requireSuperAdmin,
  validate({ params: idParam, body: approveOrderSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await ordersService.approveOrder(user(req), req.params.id, req.body as ApproveOrderInput), 'Credit order approved'),
  ),
);

router.post(
  '/:id/reject',
  requireSuperAdmin,
  validate({ params: idParam, body: rejectOrderSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await ordersService.rejectOrder(user(req), req.params.id, req.body as RejectOrderInput), 'Order rejected'),
  ),
);

// ── Fulfilment ───────────────────────────────────────────────────────────────
router.post(
  '/:id/dispatch',
  requireSuperAdmin,
  validate({ params: idParam, body: dispatchOrderSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await ordersService.dispatchOrder(user(req), req.params.id, req.body as DispatchOrderInput), 'Order dispatched'),
  ),
);

/** The outlet confirms the goods are physically in hand. */
router.post(
  '/:id/receive',
  requireRole(UserRole.FRANCHISE_OWNER, UserRole.SUPER_ADMIN),
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await ordersService.receiveOrder(user(req), req.params.id), 'Order received')),
);

router.post(
  '/:id/cancel',
  validate({ params: idParam, body: rejectOrderSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await ordersService.cancelOrder(user(req), req.params.id, req.body as RejectOrderInput), 'Order cancelled'),
  ),
);

export const ordersRouter = router;
