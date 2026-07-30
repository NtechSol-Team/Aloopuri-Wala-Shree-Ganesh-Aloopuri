import { Router } from 'express';
import { z } from 'zod';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { validate } from '../../shared/middleware/validate';
import { authGuard } from '../../shared/guards/authGuard';
import { requireSuperAdmin } from '../../shared/guards/roleGuard';
import { writeRateLimiter } from '../../shared/middleware/rateLimit';
import { created, ok, paginated } from '../../shared/utils/apiResponse';
import { AppError } from '../../shared/utils/AppError';
import {
  createEmployeeSchema, createShiftSchema, listEmployeesQuerySchema, listShiftsQuerySchema,
  updateEmployeeSchema, updateShiftSchema,
  type CreateEmployeeInput, type CreateShiftInput, type ListEmployeesQuery, type ListShiftsQuery,
  type UpdateEmployeeInput, type UpdateShiftInput,
} from './employees.schema';
import { employeesService } from './employees.service';

const idParam = z.object({ id: z.string().uuid() });

const actor = (req: Request) => {
  if (!req.user) throw AppError.unauthorized();
  return req.user.id;
};

// Staff records carry personal and salary data, so the whole module is owner-only.
const employees = Router();
employees.use(authGuard, requireSuperAdmin);

employees.get(
  '/',
  validate({ query: listEmployeesQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { rows, meta } = await employeesService.listEmployees(req.query as unknown as ListEmployeesQuery);
    return paginated(res, rows, meta);
  }),
);

employees.post(
  '/',
  writeRateLimiter,
  validate({ body: createEmployeeSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    created(res, await employeesService.createEmployee(req.body as CreateEmployeeInput, actor(req)), 'Employee added'),
  ),
);

employees.patch(
  '/:id',
  validate({ params: idParam, body: updateEmployeeSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await employeesService.updateEmployee(req.params.id, req.body as UpdateEmployeeInput), 'Employee updated'),
  ),
);

employees.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await employeesService.deleteEmployee(req.params.id), 'Employee removed')),
);

const shifts = Router();
shifts.use(authGuard, requireSuperAdmin);

shifts.get(
  '/',
  validate({ query: listShiftsQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { rows, meta } = await employeesService.listShifts(req.query as unknown as ListShiftsQuery);
    return paginated(res, rows, meta);
  }),
);

shifts.post(
  '/',
  writeRateLimiter,
  validate({ body: createShiftSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    created(res, await employeesService.createShift(req.body as CreateShiftInput, actor(req)), 'Shift added'),
  ),
);

shifts.patch(
  '/:id',
  validate({ params: idParam, body: updateShiftSchema }),
  asyncHandler(async (req: Request, res: Response) =>
    ok(res, await employeesService.updateShift(req.params.id, req.body as UpdateShiftInput), 'Shift updated'),
  ),
);

shifts.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req: Request, res: Response) => ok(res, await employeesService.deleteShift(req.params.id), 'Shift removed')),
);

export const employeesRouter = employees;
export const shiftsRouter = shifts;
