import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import type { Prisma } from '@prisma/client';

export type BillWithRelations = Prisma.BillGetPayload<{
  include: { items: true; outlet: true };
}>;

const INR = (v: Prisma.Decimal | number): string =>
  `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Render a bill to a PDF file at `filePath`. Resolves when the file is flushed. */
export function renderBillPdf(bill: BillWithRelations, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    stream.on('finish', () => resolve());
    stream.on('error', reject);

    // Header
    doc.fontSize(20).fillColor('#3730A3').text('Surat Food Chain', { align: 'left' });
    doc.fontSize(10).fillColor('#6B7280').text('Tax Invoice', { align: 'left' });
    doc.moveDown(0.5);

    doc.fontSize(14).fillColor('#111827').text(`Invoice ${bill.billNumber}`, { align: 'right' });
    doc
      .fontSize(9)
      .fillColor('#6B7280')
      .text(`Date: ${bill.billDate.toISOString().slice(0, 10)}`, { align: 'right' })
      .text(`Due:  ${bill.dueDate.toISOString().slice(0, 10)}`, { align: 'right' });
    doc.moveDown();

    // Outlet
    doc.fillColor('#111827').fontSize(11).text('Billed To:');
    doc.fontSize(10).fillColor('#374151').text(bill.outlet.name);
    if (bill.outlet.address) doc.text(bill.outlet.address);
    if (bill.outlet.phone) doc.text(bill.outlet.phone);
    doc.moveDown();

    // Table header
    const tableTop = doc.y + 6;
    const cols = { item: 50, qty: 280, rate: 340, tax: 410, total: 480 };
    doc.fontSize(9).fillColor('#6B7280');
    doc.text('ITEM', cols.item, tableTop);
    doc.text('QTY', cols.qty, tableTop);
    doc.text('RATE', cols.rate, tableTop);
    doc.text('TAX', cols.tax, tableTop);
    doc.text('TOTAL', cols.total, tableTop);
    doc.moveTo(50, tableTop + 14).lineTo(545, tableTop + 14).strokeColor('#E5E7EB').stroke();

    let y = tableTop + 22;
    doc.fillColor('#111827').fontSize(9);
    for (const item of bill.items) {
      doc.text(item.productNameSnapshot, cols.item, y, { width: 220 });
      doc.text(String(Number(item.quantity)), cols.qty, y);
      doc.text(INR(item.rate), cols.rate, y);
      doc.text(`${Number(item.taxPercent)}%`, cols.tax, y);
      doc.text(INR(item.lineTotal), cols.total, y);
      y += 20;
      if (y > 720) {
        doc.addPage();
        y = 60;
      }
    }

    doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor('#E5E7EB').stroke();
    y += 14;

    // Totals
    const labelX = 380;
    const valX = 480;
    doc.fontSize(10).fillColor('#374151');
    doc.text('Sub-total', labelX, y).text(INR(bill.subTotal), valX, y);
    y += 16;
    doc.text('Tax', labelX, y).text(INR(bill.taxTotal), valX, y);
    y += 16;
    doc.fontSize(12).fillColor('#111827').text('Grand Total', labelX, y).text(INR(bill.grandTotal), valX, y);
    y += 18;
    doc.fontSize(10).fillColor('#16A34A').text('Paid', labelX, y).text(INR(bill.amountPaid), valX, y);
    y += 16;
    doc.fillColor('#DC2626').text('Balance Due', labelX, y).text(INR(bill.balanceDue), valX, y);

    doc
      .fontSize(8)
      .fillColor('#9CA3AF')
      .text('This is a computer-generated invoice.', 50, 770, { align: 'center', width: 495 });

    doc.end();
  });
}
