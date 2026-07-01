import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { authGuard } from '../../shared/guards/authGuard';
import { ok } from '../../shared/utils/apiResponse';

const router = Router();
router.use(authGuard);

// List active outlets — used by inventory, user assignment, order/billing filters.
router.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const outlets = await prisma.outlet.findMany({
      where: { isDeleted: false },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true, address: true, phone: true, creditPeriodDays: true, ownerUserId: true, isActive: true },
    });
    return ok(res, outlets);
  }),
);

export const outletsRouter = router;
