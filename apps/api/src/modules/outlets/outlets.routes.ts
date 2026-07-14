import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireRole } from '../../shared/guards/roleGuard';
import { requireDeveloperKey } from '../../shared/guards/developerGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import { documentUpload } from '../../shared/middleware/upload';
import {
  createOutletSchema, outletProfileSchema, setOutletPricesSchema, updateOutletSchema, uploadDocumentSchema,
  type CreateOutletInput, type OutletProfileInput, type SetOutletPricesInput, type UpdateOutletInput,
  type UploadDocumentInput,
} from './outlets.schema';
import { outletsService } from './outlets.service';
import { documentsService } from './documents.service';

const idParam = z.object({ id: z.string().uuid() });
// Reading is role-based (order confirmation pre-fills special prices); creating/editing
// outlets & their prices is locked behind the hidden, passphrase-gated developer window.
const readPriceRoles = requireRole(UserRole.SUPER_ADMIN, UserRole.GODOWN_MANAGER);
const router = Router();
router.use(authGuard);

const user = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
};
const actor = (req: Request) => user(req).id;

// Unlock check for the developer window — 200 if the x-developer-key header is valid.
router.post('/dev/verify', requireDeveloperKey, asyncHandler(async (_req: Request, res: Response) => ok(res, { unlocked: true }, 'Developer access granted')));

// List active outlets — used by inventory, user assignment, order/billing filters.
router.get('/', asyncHandler(async (_req: Request, res: Response) => ok(res, await outletsService.listOutlets())));

router.post(
  '/',
  requireDeveloperKey, writeRateLimiter,
  validate({ body: createOutletSchema }),
  asyncHandler(async (req: Request, res: Response) => created(res, await outletsService.createOutlet(req.body as CreateOutletInput, actor(req)), 'Outlet created')),
);

router.get('/:id', validate({ params: idParam }), asyncHandler(async (req: Request, res: Response) => ok(res, await outletsService.getOutlet(req.params.id))));

router.patch(
  '/:id',
  requireDeveloperKey,
  validate({ params: idParam, body: updateOutletSchema }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await outletsService.updateOutlet(req.params.id, req.body as UpdateOutletInput), 'Outlet updated')),
);

// Special-price list — only meaningful once the outlet is set to SPECIAL pricing, but
// readable/writable regardless so you can prepare prices before flipping the mode.
// Read stays role-based so order confirmation can pre-fill; writes require the dev key.
router.get(
  '/:id/prices',
  readPriceRoles,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await outletsService.getOutletPrices(req.params.id))),
);
router.put(
  '/:id/prices',
  requireDeveloperKey,
  validate({ params: idParam, body: setOutletPricesSchema }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await outletsService.setOutletPrices(req.params.id, req.body as SetOutletPricesInput), 'Special prices saved')),
);

// ── Outlet business identity (main owner) ────────────────────────────────────
// Creating an outlet stays developer-only; maintaining its details does not — the
// main owner needs to keep each outlet's address/GSTIN/licences current, because
// they are printed on that outlet's receipts and invoices.
router.patch(
  '/:id/profile',
  requireRole(UserRole.SUPER_ADMIN),
  writeRateLimiter,
  validate({ params: idParam, body: outletProfileSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await outletsService.updateOutletProfile(req.params.id, req.body as OutletProfileInput), 'Outlet details saved'),
  ),
);

// ── Outlet documents ─────────────────────────────────────────────────────────
const docsUpload = documentUpload('outlet-docs');

router.get(
  '/:id/documents',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await documentsService.listDocuments(user(req), req.params.id))),
);

router.post(
  '/:id/documents',
  requireRole(UserRole.SUPER_ADMIN),
  writeRateLimiter,
  docsUpload.single('file'),
  validate({ params: idParam, body: uploadDocumentSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) throw AppError.badRequest('Attach a file', undefined, 'file');
    const doc = await documentsService.addDocument(user(req), req.params.id, req.file, req.body as UploadDocumentInput);
    return created(res, doc, 'Document uploaded');
  }),
);

/**
 * Stream a document's bytes. These are licences and signed agreements, so they are
 * NOT under the public /uploads route — every download re-checks the caller.
 */
router.get(
  '/:id/documents/:docId/file',
  validate({ params: idParam.extend({ docId: z.string().uuid() }) }),
  asyncHandler(async (req: Request, res: Response) => {
    const { absolutePath, fileName, mimeType } = await documentsService.readDocumentFile(
      user(req), req.params.id, req.params.docId,
    );
    res.type(mimeType);
    // Never let a stored file render as a page in our own origin.
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(absolutePath);
  }),
);

router.delete(
  '/:id/documents/:docId',
  requireRole(UserRole.SUPER_ADMIN),
  validate({ params: idParam.extend({ docId: z.string().uuid() }) }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await documentsService.deleteDocument(req.params.id, req.params.docId), 'Document removed'),
  ),
);

export const outletsRouter = router;
