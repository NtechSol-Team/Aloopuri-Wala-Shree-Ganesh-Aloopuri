import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireRole } from '../../shared/guards/roleGuard';
import { created, ok } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import {
  closeSessionSchema, createTransactionSchema, openSessionSchema, updateKotSchema, voidTransactionSchema,
  type CreateTransactionInput, type OpenSessionInput, type UpdateKotInput, type VoidTransactionInput,
} from './pos.schema';
import { posService } from './pos.service';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();
// POS is for admin (main branch), franchise owners and cashiers (their outlet).
router.use(authGuard, requireRole(UserRole.SUPER_ADMIN, UserRole.FRANCHISE_OWNER, UserRole.CASHIER));

const user = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
};

router.get('/products', asyncHandler(async (req: Request, res: Response) => ok(res, await posService.posProducts(user(req)))));

router.get('/sessions/current', asyncHandler(async (req: Request, res: Response) => ok(res, await posService.getCurrentSession(user(req)))));
router.post('/sessions', validate({ body: openSessionSchema }), asyncHandler(async (req: Request, res: Response) => created(res, await posService.openSession(user(req), req.body as OpenSessionInput), 'Session opened')));
router.post('/sessions/:id/close', validate({ params: idParam, body: closeSessionSchema }), asyncHandler(async (req: Request, res: Response) => ok(res, await posService.closeSession(user(req), req.params.id, (req.body as { closingCash: number }).closingCash), 'Session closed')));
router.get('/sessions/:id/summary', validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) => ok(res, await posService.getSessionSummary(req.params.id))));

router.get('/transactions', validate({ query: z.object({ sessionId: z.string().uuid() }) }), asyncHandler(async (req: Request, res: Response) => ok(res, await posService.listTransactions(req.query.sessionId as string))));
router.post('/transactions', validate({ body: createTransactionSchema }), asyncHandler(async (req: Request, res: Response) => created(res, await posService.createTransaction(user(req), req.body as CreateTransactionInput), 'Sale completed')));
router.get('/transactions/:id', validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) => ok(res, await posService.getTransaction(user(req), req.params.id))));
router.post('/transactions/:id/void', validate({ params: idParam, body: voidTransactionSchema }), asyncHandler(async (req: Request, res: Response) => ok(res, await posService.voidTransaction(user(req), req.params.id, req.body as VoidTransactionInput), 'Transaction voided')));

// Kitchen board: active tickets + ticket status advance.
router.get('/kitchen', asyncHandler(async (req: Request, res: Response) => ok(res, await posService.kitchenQueue(user(req)))));
router.patch('/transactions/:id/kot', validate({ params: idParam, body: updateKotSchema }), asyncHandler(async (req: Request, res: Response) => ok(res, await posService.updateKotStatus(user(req), req.params.id, req.body as UpdateKotInput), 'Ticket updated')));

export const posRouter = router;
