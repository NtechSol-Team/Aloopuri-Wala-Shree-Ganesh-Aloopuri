import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireRole, requireGodownAccess } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok, paginated } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { UserRole } from '@prisma/client';
import { createOrderSchema, listOrdersQuerySchema, rejectOrderSchema, verifyOrderPaymentSchema } from './orders.schema';
import type { CreateOrderInput, ListOrdersQuery, RejectOrderInput, VerifyOrderPaymentInput } from './orders.schema';
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
    created(res, await ordersService.createOrder(user(req), req.body as CreateOrderInput), 'Order placed — sent for fulfilment'),
  ),
);

router.get('/:id', validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) => ok(res, await ordersService.getOrder(user(req), req.params.id))));

// ── Outlet: pay for the order, before or after fulfilment ────────────────────
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
    ok(res, await ordersService.verifyOrderPayment(user(req), req.params.id, req.body as VerifyOrderPaymentInput), 'Payment received'),
  ),
);

// ── Fulfilment: main owner or godown sends the order out ─────────────────────
router.post(
  '/:id/fulfil',
  requireGodownAccess,
  writeRateLimiter,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await ordersService.fulfilOrder(user(req), req.params.id), 'Order fulfilled and delivered'),
  ),
);

/** Calling off an unfulfilled order is the fulfiller's call, not the outlet's. */
router.post(
  '/:id/cancel',
  requireGodownAccess,
  validate({ params: idParam, body: rejectOrderSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await ordersService.cancelOrder(user(req), req.params.id, req.body as RejectOrderInput), 'Order cancelled'),
  ),
);

export const ordersRouter = router;
