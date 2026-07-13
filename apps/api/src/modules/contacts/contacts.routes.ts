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
  createContactSchema, gstLookupQuerySchema, listContactsQuerySchema, updateContactSchema,
  type CreateContactInput, type ListContactsQuery, type UpdateContactInput,
} from './contacts.schema';
import { contactsService } from './contacts.service';

const idParam = z.object({ id: z.string().uuid() });
// Contacts (suppliers/customers) are a shared back-office directory — admin + godown
// manager only. Outlet-scoped roles (franchise owner, cashier) can't see or touch it.
const backOfficeRoles = requireRole(UserRole.SUPER_ADMIN, UserRole.GODOWN_MANAGER);
const writeRoles = backOfficeRoles;
const router = Router();
router.use(authGuard);

const actor = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

// GSTIN lookup (validate + GSTzen enrich) — used by contact + purchase forms (admin/godown).
router.get('/lookup', backOfficeRoles, validate({ query: gstLookupQuerySchema }), asyncHandler(async (req: Request, res: Response) =>
  ok(res, await lookupGstin(req.query.gstin as string), 'GSTIN resolved'),
));

router.get('/', backOfficeRoles, validate({ query: listContactsQuerySchema }), asyncHandler(async (req: Request, res: Response) => {
  const { rows, meta } = await contactsService.listContacts(req.query as unknown as ListContactsQuery);
  return paginated(res, rows, meta);
}));
router.post('/', writeRoles, writeRateLimiter, validate({ body: createContactSchema }), asyncHandler(async (req: Request, res: Response) =>
  created(res, await contactsService.createContact(req.body as CreateContactInput, actor(req)), 'Contact created'),
));
router.patch('/:id', writeRoles, validate({ params: idParam, body: updateContactSchema }), asyncHandler(async (req: Request, res: Response) =>
  ok(res, await contactsService.updateContact(req.params.id, req.body as UpdateContactInput), 'Contact updated'),
));
router.delete('/:id', writeRoles, validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) =>
  ok(res, await contactsService.deleteContact(req.params.id), 'Contact removed'),
));

export const contactsRouter = router;
