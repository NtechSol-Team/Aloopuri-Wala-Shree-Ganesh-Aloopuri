import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireSuperAdmin, requireGodownAccess } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok, paginated } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import {
  createManualBillSchema, listBillsQuerySchema, billsSummaryQuerySchema, updateBillChargesSchema, itemSalesReportQuerySchema, itemSalesReportDetailQuerySchema,
  type CreateManualBillInput, type ListBillsQuery, type BillsSummaryQuery, type UpdateBillChargesInput, type ItemSalesReportQuery, type ItemSalesReportDetailQuery,
} from './billing.schema';
import { billingService } from './billing.service';
import { renderBillPdf } from './billing.pdf';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();
router.use(authGuard);

const user = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
};

router.get(
  '/',
  validate({ query: listBillsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { rows, meta } = await billingService.listBills(user(req), req.query as unknown as ListBillsQuery);
    return paginated(res, rows, meta);
  }),
);

// Totals for the current franchise + date filter, across every bill rather than
// the page on screen. Registered before '/:id' so "summary" isn't read as an id.
router.get(
  '/summary',
  validate({ query: billsSummaryQuerySchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await billingService.getBillsSummary(user(req), req.query as unknown as BillsSummaryQuery)),
  ),
);

// Back-entry of a missed sale, and deleting a sale outright — both rewrite the
// books, so both are the main owner's alone.
router.post(
  '/manual',
  requireSuperAdmin,
  writeRateLimiter,
  validate({ body: createManualBillSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    created(res, await billingService.createManualBill(user(req), req.body as CreateManualBillInput), 'Sales bill created'),
  ),
);

router.delete(
  '/:id',
  requireSuperAdmin,
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await billingService.deleteBill(user(req), req.params.id), 'Bill deleted and sale reversed'),
  ),
);

// Set/replace packing-transport-etc charges on any bill, however it was raised —
// the main owner's only chance to add them to a bill auto-raised from a
// franchise's own order, which has no creation-time step of its own.
router.patch(
  '/:id/charges',
  requireSuperAdmin,
  writeRateLimiter,
  validate({ params: idParam, body: updateBillChargesSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await billingService.updateBillCharges(user(req), req.params.id, (req.body as UpdateBillChargesInput).charges), 'Charges updated'),
  ),
);

// One product, one period, outlet-wise — who's buying it and for how much. The
// main owner's/godown's report, not a franchise owner's: they don't need to see
// what other outlets bought. Omitting productId asks for every product instead,
// one row per product rolled up across all outlets.
router.get(
  '/reports/item-sales',
  requireGodownAccess,
  validate({ query: itemSalesReportQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as ItemSalesReportQuery;
    if (!q.productId) return ok(res, await billingService.getAllItemsSalesReport(q.from, q.to));
    return ok(res, await billingService.getItemSalesReport(q.productId, q.from, q.to));
  }),
);

// One product, one outlet, one period, bill-by-bill — the drill-down from the
// outlet row above: every bill that outlet was charged for this product, with
// the per-unit rate and line total so the figure on the summary row traces
// back to the actual invoices it was built from.
router.get(
  '/reports/item-sales/detail',
  requireGodownAccess,
  validate({ query: itemSalesReportDetailQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as ItemSalesReportDetailQuery;
    return ok(res, await billingService.getItemSalesReportDetail(q.productId, q.outletId, q.from, q.to));
  }),
);

router.get(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await billingService.getBill(user(req), req.params.id))),
);

// Streams a freshly-rendered PDF straight from the DB — never depends on the
// disk cache (see generateBillPdf job), so it works even after a restart on
// ephemeral filesystems (e.g. Render's free tier) wipes any previously-written file.
router.get(
  '/:id/pdf',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    const bill = await billingService.getBill(user(req), req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${bill.billNumber}.pdf"`);
    await renderBillPdf(bill, res);
  }),
);

router.post(
  '/:id/pdf',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await billingService.regeneratePdf(user(req), req.params.id), 'PDF generation queued')),
);

export const billingRouter = router;
