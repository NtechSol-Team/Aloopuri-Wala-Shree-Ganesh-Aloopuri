import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { authGuard } from '../../shared/guards/authGuard';
import { requireDeveloperKey } from '../../shared/guards/developerGuard';
import { ok } from '../../shared/utils/apiResponse';
import { developerPresenceService } from './developer-presence.service';

const router = Router();

// Developer-passphrase gated, exactly like the payments ledger — who is using
// the software and for how long is the developer's own operational view, not
// something any in-app role (SUPER_ADMIN included) should see.
router.use(authGuard, requireDeveloperKey);

router.get('/online', asyncHandler(async (_req: Request, res: Response) => ok(res, developerPresenceService.listOnline())));
router.get('/today', asyncHandler(async (_req: Request, res: Response) => ok(res, await developerPresenceService.getTodaySummary())));

export const developerPresenceRouter = router;
