import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import type { Prisma } from '@prisma/client';
import { env } from '../../config/env';

export type BillWithRelations = Prisma.BillGetPayload<{
  include: { items: true; outlet: true };
}>;

const LOGO_PATH = path.resolve(process.cwd(), 'assets/logo.png');

const COLOR = {
  brand: '#3730A3',
  brandLight: '#EEF2FF',
  text: '#111827',
  muted: '#6B7280',
  faint: '#9CA3AF',
  line: '#E5E7EB',
  success: '#16A34A',
  danger: '#DC2626',
  headerBg: '#F3F4F6',
};

const PAGE = { left: 50, right: 545, width: 495 };

const INR = (v: Prisma.Decimal | number): string =>
  `Rs ${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Render a bill to a PDF file at `filePath`. Resolves when the file is flushed. */
export function renderBillPdf(bill: BillWithRelations, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    stream.on('finish', () => resolve());
    stream.on('error', reject);

    const hasLogo = fs.existsSync(LOGO_PATH);

    // ── Letterhead ──────────────────────────────────────────────────────────
    const headerTop = 50;
    if (hasLogo) {
      doc.image(LOGO_PATH, PAGE.left, headerTop, { width: 70 });
    }
    const textX = hasLogo ? PAGE.left + 82 : PAGE.left;
    doc.fontSize(18).fillColor(COLOR.text).text(env.COMPANY_NAME, textX, headerTop, { width: 260 });
    doc.fontSize(9).fillColor(COLOR.muted).text(env.COMPANY_TAGLINE, textX, doc.y + 1, { width: 260 });
    const addrLines = [env.COMPANY_ADDRESS, env.COMPANY_PHONE ? `Ph: ${env.COMPANY_PHONE}` : ''].filter(Boolean);
    if (addrLines.length) doc.fontSize(8).fillColor(COLOR.faint).text(addrLines.join('  ·  '), textX, doc.y + 2, { width: 260 });
    if (bill.isGstBill && env.COMPANY_GSTIN) doc.fontSize(8).fillColor(COLOR.faint).text(`GSTIN: ${env.COMPANY_GSTIN}`, textX, doc.y + 1, { width: 260 });

    doc.fontSize(16).fillColor(COLOR.brand).text(bill.isGstBill ? 'TAX INVOICE' : 'INVOICE', PAGE.left, headerTop, { align: 'right', width: PAGE.width });
    doc.fontSize(10).fillColor(COLOR.text).text(bill.billNumber, PAGE.left, doc.y + 2, { align: 'right', width: PAGE.width });
    doc
      .fontSize(8.5)
      .fillColor(COLOR.muted)
      .text(`Date: ${bill.billDate.toISOString().slice(0, 10)}`, PAGE.left, doc.y + 3, { align: 'right', width: PAGE.width })
      .text(`Due:  ${bill.dueDate.toISOString().slice(0, 10)}`, PAGE.left, doc.y + 1, { align: 'right', width: PAGE.width });
    if (!bill.isGstBill) {
      doc.fontSize(8).fillColor(COLOR.faint).text('No GST charged on this invoice', PAGE.left, doc.y + 3, { align: 'right', width: PAGE.width });
    }

    let y = Math.max(doc.y, headerTop + 70) + 14;
    doc.moveTo(PAGE.left, y).lineTo(PAGE.right, y).lineWidth(1.5).strokeColor(COLOR.brand).stroke();
    y += 16;

    // ── Billed To ───────────────────────────────────────────────────────────
    doc.fontSize(8.5).fillColor(COLOR.muted).text('BILLED TO', PAGE.left, y);
    y = doc.y + 2;
    doc.fontSize(11).fillColor(COLOR.text).text(bill.outlet.name, PAGE.left, y);
    y = doc.y;
    doc.fontSize(9).fillColor(COLOR.muted);
    if (bill.outlet.address) { doc.text(bill.outlet.address, PAGE.left, y + 2, { width: 300 }); y = doc.y; }
    if (bill.outlet.phone) { doc.text(bill.outlet.phone, PAGE.left, y + 2); y = doc.y; }
    y += 18;

    // ── Item table ──────────────────────────────────────────────────────────
    const showTax = bill.isGstBill;
    const cols = showTax
      ? { item: PAGE.left, qty: 275, rate: 330, tax: 400, total: 470 }
      : { item: PAGE.left, qty: 320, rate: 395, tax: 0, total: 470 };

    const tableHeaderY = y;
    doc.rect(PAGE.left, tableHeaderY, PAGE.width, 20).fill(COLOR.headerBg);
    doc.fontSize(8.5).fillColor(COLOR.muted);
    doc.text('ITEM', cols.item + 6, tableHeaderY + 6);
    doc.text('QTY', cols.qty, tableHeaderY + 6, { width: 45, align: 'right' });
    doc.text('RATE', cols.rate, tableHeaderY + 6, { width: 60, align: 'right' });
    if (showTax) doc.text('TAX', cols.tax, tableHeaderY + 6, { width: 60, align: 'right' });
    doc.text('TOTAL', cols.total, tableHeaderY + 6, { width: 75, align: 'right' });
    y = tableHeaderY + 20;

    doc.fontSize(9.5);
    let rowIndex = 0;
    for (const item of bill.items) {
      const rowH = 22;
      if (y + rowH > 740) {
        doc.addPage();
        y = 50;
      }
      if (rowIndex % 2 === 1) doc.rect(PAGE.left, y, PAGE.width, rowH).fill('#FAFAFA');
      doc.fillColor(COLOR.text).font('Helvetica').fontSize(9.5);
      doc.text(item.productNameSnapshot, cols.item + 6, y + 6, { width: showTax ? 215 : 260 });
      doc.fillColor(COLOR.muted);
      doc.text(String(Number(item.quantity)), cols.qty, y + 6, { width: 45, align: 'right' });
      doc.text(INR(item.rate), cols.rate, y + 6, { width: 60, align: 'right' });
      if (showTax) doc.text(`${Number(item.taxPercent)}%`, cols.tax, y + 6, { width: 60, align: 'right' });
      doc.fillColor(COLOR.text).text(INR(item.lineTotal), cols.total, y + 6, { width: 75, align: 'right' });
      y += rowH;
      rowIndex += 1;
    }
    doc.moveTo(PAGE.left, y).lineTo(PAGE.right, y).strokeColor(COLOR.line).stroke();
    y += 14;

    // ── Totals ──────────────────────────────────────────────────────────────
    const labelX = 360;
    const valX = 470;
    const valW = 75;
    doc.fontSize(9.5).fillColor(COLOR.muted);
    doc.text('Sub-total', labelX, y, { width: 100 }).text(INR(bill.subTotal), valX, y, { width: valW, align: 'right' });
    y += 15;
    if (showTax) {
      doc.text('GST', labelX, y, { width: 100 }).text(INR(bill.taxTotal), valX, y, { width: valW, align: 'right' });
      y += 15;
    }
    doc.moveTo(labelX, y + 2).lineTo(PAGE.right, y + 2).strokeColor(COLOR.line).stroke();
    y += 8;
    doc.fontSize(12.5).fillColor(COLOR.text).font('Helvetica-Bold');
    doc.text('Grand Total', labelX, y, { width: 100 }).text(INR(bill.grandTotal), valX, y, { width: valW, align: 'right' });
    doc.font('Helvetica');
    y += 22;

    const balance = Number(bill.balanceDue);
    doc.fontSize(9.5).fillColor(COLOR.success);
    doc.text('Paid', labelX, y, { width: 100 }).text(INR(bill.amountPaid), valX, y, { width: valW, align: 'right' });
    y += 15;
    if (balance > 0) {
      doc.fillColor(COLOR.danger).font('Helvetica-Bold');
      doc.text('Balance Due', labelX, y, { width: 100 }).text(INR(bill.balanceDue), valX, y, { width: valW, align: 'right' });
      doc.font('Helvetica');
    } else {
      doc.fillColor(COLOR.success).font('Helvetica-Bold');
      doc.roundedRect(labelX, y - 2, 185, 18, 3).fillAndStroke(COLOR.brandLight, COLOR.brandLight);
      doc.fillColor(COLOR.success).text('PAID IN FULL', labelX, y + 2, { width: 185, align: 'center' });
      doc.font('Helvetica');
    }

    // ── Footer ──────────────────────────────────────────────────────────────
    doc.moveTo(PAGE.left, 760).lineTo(PAGE.right, 760).strokeColor(COLOR.line).stroke();
    doc
      .fontSize(8)
      .fillColor(COLOR.faint)
      .text('This is a computer-generated invoice.', PAGE.left, 768, { align: 'center', width: PAGE.width });
    if (env.COMPANY_PHONE || env.COMPANY_GSTIN) {
      const bits = [env.COMPANY_PHONE && `Ph: ${env.COMPANY_PHONE}`, env.COMPANY_GSTIN && `GSTIN: ${env.COMPANY_GSTIN}`].filter(Boolean);
      doc.text(bits.join('   ·   '), PAGE.left, 780, { align: 'center', width: PAGE.width });
    }

    doc.end();
  });
}
