import path from 'node:path';
import fs from 'node:fs/promises';
import { env } from '../../config/env';

/**
 * Where a bill PDF lives on disk.
 *
 * Kept OUTSIDE `UPLOAD_DIR` on purpose. That directory is mounted publicly by
 * `express.static`, and bill filenames are sequential invoice numbers — so anything
 * written there can be downloaded by anyone willing to count from BL-YYYY-00001.
 * Bills are reachable only through the authenticated `GET /billing/:id/pdf`, which
 * renders from the database, so this file is a cache and nothing depends on it.
 */
export function billPdfPath(billNumber: string): string {
  return path.resolve(process.cwd(), env.PRIVATE_STORAGE_DIR, 'bills', `${billNumber}.pdf`);
}

/** Remove a bill's cached PDF. Missing file is fine — the cache is best-effort. */
export async function removeBillPdf(billNumber: string): Promise<void> {
  await fs.unlink(billPdfPath(billNumber)).catch(() => undefined);
}
