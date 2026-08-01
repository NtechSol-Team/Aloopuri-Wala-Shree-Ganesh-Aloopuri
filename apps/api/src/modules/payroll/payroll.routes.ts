import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireSuperAdmin } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import {
  generatePayrollSchema, listAttendanceQuerySchema, listPayrollQuerySchema, markPaidSchema,
  periodQuerySchema, saveAttendanceSchema, updatePayrollSchema,
  createAdvanceSchema, updateAdvanceSchema, listAdvancesQuerySchema,
  type GeneratePayrollInput, type ListAttendanceQuery, type ListPayrollQuery, type MarkPaidInput,
  type PeriodQuery, type SaveAttendanceInput, type UpdatePayrollInput,
  type CreateAdvanceInput, type UpdateAdvanceInput, type ListAdvancesQuery,
} from './payroll.schema';
import { payrollService } from './payroll.service';
import { advancesService } from './advances.service';
import { renderPayslipPdf } from './payroll.pdf';

const idParam = z.object({ id: z.string().uuid() });
const router = Router();

// Salary data is personal; the whole module is owner-only, like the employee master.
router.use(authGuard, requireSuperAdmin);

const actor = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

// ───────────────────────────── Attendance ───────────────────────────────────
router.get(
  '/attendance',
  validate({ query: listAttendanceQuerySchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await payrollService.listAttendance(req.query as unknown as ListAttendanceQuery)),
  ),
);

router.put(
  '/attendance',
  writeRateLimiter,
  validate({ body: saveAttendanceSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await payrollService.saveAttendance(req.body as SaveAttendanceInput, actor(req)), 'Attendance saved'),
  ),
);

router.delete(
  '/attendance/:id',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await payrollService.deleteAttendance(req.params.id), 'Attendance removed')),
);

// ────────────────────────── Employee advances ────────────────────────────────
router.get(
  '/advances',
  validate({ query: listAdvancesQuerySchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await advancesService.listAdvances(req.query as unknown as ListAdvancesQuery)),
  ),
);

router.post(
  '/advances',
  writeRateLimiter,
  validate({ body: createAdvanceSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    created(res, await advancesService.createAdvance(req.body as CreateAdvanceInput, actor(req)), 'Advance recorded'),
  ),
);

router.patch(
  '/advances/:id',
  validate({ params: idParam, body: updateAdvanceSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await advancesService.updateAdvance(req.params.id, req.body as UpdateAdvanceInput), 'Advance updated'),
  ),
);

router.delete(
  '/advances/:id',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await advancesService.deleteAdvance(req.params.id), 'Advance removed')),
);

// ────────────────────────────── Payroll ─────────────────────────────────────
router.get(
  '/',
  validate({ query: listPayrollQuerySchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await payrollService.listPayroll(req.query as unknown as ListPayrollQuery)),
  ),
);

router.post(
  '/generate',
  writeRateLimiter,
  validate({ body: generatePayrollSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    created(res, await payrollService.generatePayroll(req.body as GeneratePayrollInput, actor(req)), 'Salary generated'),
  ),
);

router.patch(
  '/:id',
  validate({ params: idParam, body: updatePayrollSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await payrollService.updatePayroll(req.params.id, req.body as UpdatePayrollInput), 'Payroll updated'),
  ),
);

router.post(
  '/:id/pay',
  validate({ params: idParam, body: markPaidSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await payrollService.markPayrollPaid(req.params.id, req.body as MarkPaidInput, actor(req)), 'Salary marked paid'),
  ),
);

router.post(
  '/:id/revert',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await payrollService.revertPayrollPayment(req.params.id), 'Payment reverted'),
  ),
);

/**
 * The salary slip. Streamed straight from the database through this authenticated
 * route rather than written under /uploads — that path is served publicly, and a
 * payslip is personal salary data.
 */
router.get(
  '/:id/slip.pdf',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => {
    const slip = await payrollService.getPayslip(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `inline; filename="${slip.payrollNo}.pdf"`);
    await renderPayslipPdf(slip, res);
  }),
);

// ─────────────────────── Dashboard + reports ────────────────────────────────
router.get(
  '/dashboard',
  validate({ query: periodQuerySchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await payrollService.getPayrollDashboard(req.query as unknown as PeriodQuery)),
  ),
);

router.get('/reports/employees', asyncHandler(async (_req: Request, res: Response) => ok(res, await payrollService.employeeMasterReport())));

router.get(
  '/reports/attendance',
  validate({ query: periodQuerySchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await payrollService.attendanceReport(req.query as unknown as PeriodQuery)),
  ),
);

router.get(
  '/reports/register',
  validate({ query: periodQuerySchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await payrollService.salaryRegisterReport(req.query as unknown as PeriodQuery)),
  ),
);

router.get(
  '/reports/monthly',
  validate({ query: z.object({ year: z.coerce.number().int().min(2000).max(2100) }) }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await payrollService.monthlySummaryReport(req.query as unknown as { year: number })),
  ),
);

export const payrollRouter = router;
