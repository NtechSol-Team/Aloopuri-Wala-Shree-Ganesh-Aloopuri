'use client';

import { format } from 'date-fns';
import type { PosTxn } from '@/hooks/usePos';
import { DEFAULT_STORE, type OrderPickListLine, type ItemReportRow, type StoreProfile } from '@/lib/receipt-print';
import { EscPosEncoder, wrapText, type MonoRaster } from './escpos-encoder';
import { loadImageAsRaster, textToRaster } from './escpos-image';
import { colsFor, dotsFor, type PrinterSettings } from './printer-settings';

/** True when every character is printable ASCII the thermal font can render. */
const isAscii = (s: string) => !/[^\x00-\x7f]/.test(s);

/**
 * Print a standalone text line that might contain non-Latin script (Gujarati
 * product/shop names). ASCII stays native printer text — crisp and fast; anything
 * else is rendered to a bitmap and printed as an image, because the printer's
 * built-in fonts have no glyph for it and would otherwise emit "????".
 */
function smartLine(
  e: EscPosEncoder,
  s: PrinterSettings,
  text: string,
  o: { bold?: boolean; center?: boolean; big?: boolean } = {},
): void {
  if (isAscii(text)) {
    e.align(o.center ? 'center' : 'left');
    if (o.bold) e.bold(true);
    if (o.big) e.size(2, 2);
    for (const ln of wrapText(text, o.big ? Math.floor(e.cols / 2) : e.cols)) e.line(ln);
    if (o.big) e.size(1, 1);
    if (o.bold) e.bold(false);
    e.align('left');
    return;
  }
  e.align(o.center ? 'center' : 'left');
  e.imageRaster(textToRaster(text, {
    widthDots: dotsFor(s),
    fontPx: o.big ? 48 : 28,
    bold: o.bold ?? o.big,
    align: o.center ? 'center' : 'left',
  }));
  e.align('left');
}

/** A "Label   value" row where the value might be non-Latin (e.g. customer name). */
function labelLine(e: EscPosEncoder, s: PrinterSettings, label: string, value: string): void {
  if (isAscii(value)) { e.leftRight(label, value); return; }
  e.align('left').line(`${label}:`);
  e.imageRaster(textToRaster(value, { widthDots: dotsFor(s), fontPx: 28, align: 'left' }));
}

/**
 * ESC/POS renderings of the same documents `lib/receipt-print.ts` renders as
 * HTML. The HTML versions remain the Windows/system-dialog path; these byte
 * versions go straight to Bluetooth thermal printers on Android.
 */

// The company's own name — used for head-office documents (pick lists), while a
// counter receipt prints the selling outlet's identity via its StoreProfile.
const STORE_NAME = DEFAULT_STORE.name;

const inr = (v: string | number) => `Rs ${Number(v).toFixed(2)}`;

// The logo raster is expensive to build (fetch + dither), so cache per dot-width.
const logoCache = new Map<number, Promise<MonoRaster | null>>();
function getLogo(maxWidthDots: number): Promise<MonoRaster | null> {
  let cached = logoCache.get(maxWidthDots);
  if (!cached) {
    cached = loadImageAsRaster('/logo.png', { maxWidthDots }).catch(() => null);
    logoCache.set(maxWidthDots, cached);
  }
  return cached;
}

/**
 * Receipt masthead: the selling shop's own identity. For an outlet's counter
 * receipt that means the outlet's name, address, GSTIN and food licence — the
 * company name only stands in when no outlet is in context.
 */
async function header(e: EscPosEncoder, s: PrinterSettings, store: StoreProfile, subtitle?: string): Promise<void> {
  e.init().align('center');
  if (s.printLogo) {
    const logo = await getLogo(Math.min(dotsFor(s), 320));
    if (logo) { e.imageRaster(logo); e.feed(1); }
  }
  // Shop name and address may be Gujarati, so route them through smartLine.
  smartLine(e, s, store.name, { bold: true, center: true, big: true });
  if (subtitle) smartLine(e, s, subtitle, { center: true });
  else if (store.tagline) smartLine(e, s, store.tagline, { center: true });

  if (store.address) smartLine(e, s, store.address, { center: true });
  e.align('center');
  if (store.phone) e.line(`Ph: ${store.phone}`);
  if (store.gstin) e.line(`GSTIN: ${store.gstin}`);
  if (store.fssaiNumber) e.line(`FSSAI: ${store.fssaiNumber}`);
  e.align('left');
}

/** 80/58mm POS receipt — mirrors `printReceipt`'s HTML layout. */
export async function receiptBytes(
  txn: PosTxn,
  opts: { cashierName?: string; store?: StoreProfile },
  s: PrinterSettings,
): Promise<Uint8Array> {
  const store = opts.store ?? DEFAULT_STORE;
  const e = new EscPosEncoder({ cols: colsFor(s) });
  await header(e, s, store);

  if (txn.status === 'VOID') {
    e.feed(1).invert(true).size(2, 2).line('  VOID  ').size(1, 1).invert(false);
  }
  if (txn.tokenNumber != null) {
    e.feed(1).line('TOKEN').bold(true).size(4, 4).line(`#${txn.tokenNumber}`).size(1, 1).bold(false);
  }

  e.align('left').divider();
  e.leftRight('Receipt', txn.receiptNumber);
  e.leftRight('Date', format(new Date(txn.soldAt), 'dd MMM yyyy, hh:mm a'));
  if (opts.cashierName) labelLine(e, s, 'Cashier', opts.cashierName);
  if (txn.customerName) labelLine(e, s, 'Customer', txn.customerName);
  e.divider();

  for (const it of txn.items) {
    const qty = Number(it.quantity);
    const disc = Number(it.discount);
    // Product name may be Gujarati → printed as an image when it is.
    smartLine(e, s, it.productNameSnapshot, { bold: true });
    e.leftRight(`  ${qty} x ${inr(it.unitPrice)}${disc > 0 ? ` (-${inr(disc)})` : ''}`, inr(it.lineTotal));
  }

  e.divider();
  e.leftRight('Sub-total', inr(txn.subTotal));
  const discountTotal = Number(txn.itemDiscount) + Number(txn.billDiscount);
  if (discountTotal > 0) e.leftRight('Discount', `-${inr(discountTotal)}`);
  if (Number(txn.taxTotal) > 0) e.leftRight('Tax', inr(txn.taxTotal));

  e.bold(true).size(2, 2);
  // At double width only cols/2 characters fit per line.
  const totalCols = Math.floor(e.cols / 2);
  const totalStr = inr(txn.grandTotal);
  const totalPad = Math.max(1, totalCols - 'TOTAL'.length - totalStr.length);
  e.line('TOTAL' + ' '.repeat(totalPad) + totalStr);
  e.size(1, 1).bold(false);

  const cashPart = Number(txn.cashAmount ?? 0);
  const onlinePart = Number(txn.cardAmount ?? 0) + Number(txn.upiAmount ?? 0);
  if (cashPart > 0) e.leftRight('Cash', inr(cashPart));
  if (onlinePart > 0) e.leftRight('Online (Card/UPI)', inr(onlinePart));
  if (txn.paymentMode === 'CASH') {
    e.leftRight('Cash received', inr(txn.cashReceived ?? txn.grandTotal));
    e.leftRight('Change', inr(txn.changeGiven ?? 0));
  }

  e.feed(1);
  smartLine(e, s, store.footer || 'Thank you! Visit again', { center: true });
  smartLine(e, s, `- ${store.tagline || store.name} -`, { center: true });

  if (s.printBarcode) {
    e.feed(1).barcode(txn.receiptNumber, { height: 56, hri: true });
  }

  e.feed(4).cut();
  return e.encode();
}

/** Godown/admin pick list — mirrors `printOrderPickList`. */
export function pickListBytes(
  order: { orderNumber: string; outletName: string; fulfillmentSource: 'MAIN_BRANCH' | 'GODOWN'; isGstBill: boolean },
  lines: OrderPickListLine[],
  s: PrinterSettings,
): Uint8Array {
  const e = new EscPosEncoder({ cols: colsFor(s) });
  e.init().align('center');
  e.bold(true).size(2, 2).line(STORE_NAME).size(1, 1).bold(false);
  e.line('Order Pick List');

  e.align('left').divider();
  e.leftRight('Order', order.orderNumber);
  e.leftRight('Outlet', order.outletName);
  e.leftRight('Fulfil from', order.fulfillmentSource === 'GODOWN' ? 'Godown' : 'Main Branch');
  e.leftRight('Confirmed', format(new Date(), 'dd MMM yyyy, hh:mm a'));
  e.leftRight('Bill type', order.isGstBill ? 'With GST' : 'No GST');
  e.divider();

  let total = 0;
  for (const l of lines) {
    total += l.approvedQty * l.price;
    smartLine(e, s, l.name, { bold: true });
    e.leftRight(`  ${l.approvedQty} ${l.unit} x ${inr(l.price)}`, inr(l.approvedQty * l.price));
  }

  e.divider();
  e.bold(true).leftRight('ESTIMATED TOTAL', inr(total)).bold(false);
  e.feed(1).align('center').line('Pack & dispatch the quantities above.');
  e.feed(4).cut();
  return e.encode();
}

/** POS session item-wise sales report — mirrors `printSessionItemReport`. */
export function sessionReportBytes(
  rows: ItemReportRow[],
  meta: { sessionNumber: string; cashierName?: string; openedAt: string; store?: StoreProfile },
  s: PrinterSettings,
): Uint8Array {
  const store = meta.store ?? DEFAULT_STORE;
  const e = new EscPosEncoder({ cols: colsFor(s) });
  e.init();
  smartLine(e, s, store.name, { bold: true, center: true, big: true });
  e.align('center').line('Item-wise Sales Report');

  e.align('left').divider();
  e.leftRight('Session', meta.sessionNumber);
  e.leftRight('Opened', format(new Date(meta.openedAt), 'dd MMM yyyy, hh:mm a'));
  if (meta.cashierName) e.leftRight('Cashier', meta.cashierName);
  e.leftRight('Printed', format(new Date(), 'hh:mm a'));
  e.divider();

  if (!rows.length) {
    e.align('center').line('No sales yet.').align('left');
  } else {
    for (const r of rows) {
      smartLine(e, s, r.name, { bold: true });
      e.leftRight(`  ${r.qty} sold`, inr(r.revenue));
    }
  }

  e.divider();
  e.leftRight('Items sold', String(rows.reduce((t, r) => t + r.qty, 0)));
  e.bold(true).leftRight('TOTAL REVENUE', inr(rows.reduce((t, r) => t + r.revenue, 0))).bold(false);
  e.feed(4).cut();
  return e.encode();
}

/**
 * Diagnostic slip for the settings dialog's "Test print" button — exercises
 * every capability (alignment, sizes, bold/invert, QR, barcode, logo image)
 * so a new printer can be validated in one shot.
 */
export async function testSlipBytes(s: PrinterSettings): Promise<Uint8Array> {
  const e = new EscPosEncoder({ cols: colsFor(s) });
  await header(e, { ...s, printLogo: true }, DEFAULT_STORE, 'Printer test page');
  e.align('left').divider();
  e.leftRight('Paper width', `${s.paperWidthMm}mm (${colsFor(s)} cols)`);
  e.leftRight('Time', format(new Date(), 'dd MMM yyyy, hh:mm:ss a'));
  e.divider();
  e.line('Normal text 0123456789');
  e.bold(true).line('Bold text').bold(false);
  e.size(2, 1).line('Double width').size(1, 2).line('Double height').size(2, 2).line('Big').size(1, 1);
  e.invert(true).line(' Inverted ').invert(false);
  e.divider();
  e.align('center').line('QR code:');
  e.qr('https://scfc.example/receipt-test', { size: 6 });
  e.feed(1).line('Barcode:');
  e.barcode('SCFC-TEST-123', { height: 56, hri: true });
  e.feed(1).line('If all sections printed, the');
  e.line('printer is configured correctly.');
  e.feed(4).cut();
  return e.encode();
}
