import path from 'node:path';
import fs from 'node:fs';
import type { Job } from 'pg-boss';
import { prisma } from '../../config/prisma';
import { logger } from '../../config/logger';
import { env } from '../../config/env';
import { emitRealtime } from '../../sockets/realtime';
import { RealtimeEvent } from '../../sockets/events';
import { renderBillPdf } from '../../modules/billing/billing.pdf';

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

    const dir = path.resolve(process.cwd(), env.UPLOAD_DIR, 'bills');
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${bill.billNumber}.pdf`);

    await renderBillPdf(bill, filePath);

    const pdfUrl = `/uploads/bills/${bill.billNumber}.pdf`;
    await prisma.bill.update({ where: { id: bill.id }, data: { pdfUrl } });

    await emitRealtime(
      RealtimeEvent.REPORT_READY,
      { type: 'bill_pdf', billId: bill.id, billNumber: bill.billNumber, url: pdfUrl },
      { global: true, outletId: bill.outletId },
    );
    logger.debug({ billNumber: bill.billNumber }, 'bill PDF generated');
  }
}
