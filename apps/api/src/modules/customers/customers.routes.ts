import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireRole } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok, paginated } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { lookupGstin } from '../../shared/services/gstLookup';
import {
  createCustomerSchema, gstLookupQuerySchema, listCustomersQuerySchema, updateCustomerSchema,
  type CreateCustomerInput, type ListCustomersQuery, type UpdateCustomerInput,
} from './customers.schema';
import { customersService } from './customers.service';

const idParam = z.object({ id: z.string().uuid() });
const writeRoles = requireRole(UserRole.SUPER_ADMIN, UserRole.FRANCHISE_OWNER);
const router = Router();
router.use(authGuard);

const actor = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

// GSTIN lookup (validate + GSTzen enrich) — used by customer + purchase forms.
router.get('/lookup', validate({ query: gstLookupQuerySchema }), asyncHandler(async (req: Request, res: Response) =>
  ok(res, await lookupGstin(req.query.gstin as string), 'GSTIN resolved'),
));

router.get('/', validate({ query: listCustomersQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { rows, meta } = await customersService.listCustomers(req.query as unknown as ListCustomersQuery);
  return paginated(res, rows, meta);
}));
router.post('/', writeRoles, writeRateLimiter, validate({ body: createCustomerSchema }), asyncHandler(async (req: Request, res: Response) =>
  created(res, await customersService.createCustomer(req.body as CreateCustomerInput, actor(req)), 'Customer created'),
));
router.patch('/:id', writeRoles, validate({ params: idParam, body: updateCustomerSchema }), asyncHandler(async (req: Request, res: Response) =>
  ok(res, await customersService.updateCustomer(req.params.id, req.body as UpdateCustomerInput), 'Customer updated'),
));
router.delete('/:id', writeRoles, validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) =>
  ok(res, await customersService.deleteCustomer(req.params.id), 'Customer removed'),
));

export const customersRouter = router;
