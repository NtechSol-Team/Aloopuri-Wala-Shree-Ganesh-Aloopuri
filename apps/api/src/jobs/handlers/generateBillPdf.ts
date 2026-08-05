import path from 'node:path';
import fs from 'node:fs';
import type { Job } from 'pg-boss';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { emitRealtime } from '../../sockets/realtime';
import { RealtimeEvent } from '../../sockets/events';
import { renderBillPdf } from '../../modules/billing/billing.pdf';
import { billPdfPath } from '../../modules/billing/billing.storage';

export interface GenerateBillPdfPayload {
  billId: string;
}

/** Generate a bill PDF asynchronously and notify the requester when ready. */
export async function generateBillPdfHandler(jobs: Job<GenerateBillPdfPayload>[]): Promise<void> {
  for (const job of jobs) {
    const { billId } = job.data;
    const bill = await prisma.bill.findUnique({
      where: { id: billId },
      include: { items: true, outlet: true },
    });
    if (!bill) {
      logger.warn({ billId }, 'generateBillPdf: bill not found');
      continue;
    }

    // Deliberately NOT under UPLOAD_DIR: that directory is served publicly, and bill
    // filenames are sequential invoice numbers, so anything written there is
    // downloadable by anyone who counts upwards. See billPdfPath().
    const filePath = billPdfPath(bill.billNumber);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    // Best-effort disk cache — on ephemeral filesystems (e.g. Render's free tier) this
    // won't survive a restart, so the actual download endpoint (GET /billing/:id/pdf)
    // never relies on it and regenerates fresh from the DB instead.
    await renderBillPdf(bill, fs.createWriteStream(filePath));

    // The authenticated API route, not a static file path — a bill PDF is only ever
    // fetched with an Authorization header.
    const pdfUrl = `/api/v1/billing/${bill.id}/pdf`;
    await prisma.bill.update({ where: { id: bill.id }, data: { pdfUrl } });

    await emitRealtime(
      RealtimeEvent.REPORT_READY,
      { type: 'bill_pdf', billId: bill.id, billNumber: bill.billNumber, url: pdfUrl },
      { global: true, outletId: bill.outletId },
    );
    logger.debug({ billNumber: bill.billNumber }, 'bill PDF generated');
  }
}
