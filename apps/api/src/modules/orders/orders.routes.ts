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
import { confirmOrderSchema, createOrderSchema, listOrdersQuerySchema } from './orders.schema';
import type { ConfirmOrderInput, CreateOrderInput, ListOrdersQuery } from './orders.schema';
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
  asyncHandler(async (req: Request, res: Response) => created(res, await ordersService.createOrder(user(req), req.body as CreateOrderInput), 'Order placed')),
);

router.get('/:id', validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) => ok(res, await ordersService.getOrder(user(req), req.params.id))));

router.post(
  '/:id/confirm',
  requireSuperAdmin,
  validate({ params: idParam, body: confirmOrderSchema }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await ordersService.confirmOrder(user(req), req.params.id, req.body as ConfirmOrderInput), 'Order confirmed')),
);
router.post('/:id/dispatch', requireSuperAdmin, validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) => ok(res, await ordersService.dispatchOrder(user(req), req.params.id), 'Order dispatched & bill generated')));
router.post('/:id/deliver', requireSuperAdmin, validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) => ok(res, await ordersService.deliverOrder(user(req), req.params.id), 'Order delivered')));
router.post('/:id/cancel', validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) => ok(res, await ordersService.cancelOrder(user(req), req.params.id), 'Order cancelled')));

export const ordersRouter = router;
