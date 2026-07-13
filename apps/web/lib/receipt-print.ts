'use client';

import { format } from 'date-fns';
import type { PosTxn } from '@/hooks/usePos';
import { androidPrinter, hasAndroidBridge } from '@/lib/print/android-bridge';

const STORE_NAME = 'Shree Ganesh Aloopuri';
const STORE_TAGLINE = 'Surat Food Chain';

const AUTOPRINT_KEY = 'scfc-pos-autoprint';

export function getAutoPrint(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(AUTOPRINT_KEY) !== 'off';
}

export function setAutoPrint(on: boolean): void {
  localStorage.setItem(AUTOPRINT_KEY, on ? 'on' : 'off');
}

const inr = (v: string | number) => `Rs ${Number(v).toFixed(2)}`;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Render `html` into a hidden iframe and trigger the browser print dialog (or silent print, if the browser/kiosk flag is configured for it). */
function printHtml(html: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const cleanup = () => setTimeout(() => iframe.remove(), 60_000);
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      cleanup();
    }
  };
  iframe.srcdoc = html;
}

/**
 * Load a PDF blob (e.g. a bill fetched from the API) into a hidden iframe and trigger
 * the browser print dialog for it — one click, no separate "open then print" step.
 * Chrome's built-in PDF viewer needs a beat to finish rendering after the iframe's own
 * load event before print() reliably grabs the right content, hence the short delay.
 *
 * Inside the SCFC Print Bridge Android app there is no PDF viewer or print dialog in
 * the WebView, so the blob is handed to the app instead, which opens it in the system
 * PDF viewer (from where it can be shared/printed via any installed service).
 */
export function printPdfBlob(blob: Blob): void {
  if (hasAndroidBridge()) {
    void androidPrinter.openPdf(blob, `bill-${Date.now()}.pdf`);
    return;
  }
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const cleanup = () => setTimeout(() => { iframe.remove(); URL.revokeObjectURL(url); }, 60_000);
  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        cleanup();
      }
    }, 300);
  };
  iframe.src = url;
}

/**
 * 80mm thermal-style receipt (B2C — no GST invoice, taxes shown as included).
 * Renders into a hidden iframe and opens the browser print dialog, which works
 * with any installed thermal/receipt printer as well as normal printers.
 */
export function printReceipt(txn: PosTxn, opts: { cashierName?: string } = {}): void {
  const itemsRows = txn.items
    .map((it) => {
      const qty = Number(it.quantity);
      const disc = Number(it.discount);
      return `
        <tr>
          <td class="name" colspan="3">${esc(it.productNameSnapshot)}</td>
        </tr>
        <tr class="sub">
          <td>${qty} × ${inr(it.unitPrice)}${disc > 0 ? ` (−${inr(disc)})` : ''}</td>
          <td></td>
          <td class="num">${inr(it.lineTotal)}</td>
        </tr>`;
    })
    .join('');

  const discountTotal = Number(txn.itemDiscount) + Number(txn.billDiscount);

  // Cash vs online (card + UPI) breakdown — always from the actual amounts recorded
  // against the sale, so split payments show both instead of just a mode label.
  const cashPart = Number(txn.cashAmount ?? 0);
  const onlinePart = Number(txn.cardAmount ?? 0) + Number(txn.upiAmount ?? 0);
  const payLine = `
    ${cashPart > 0 ? `<div class="row"><span>Cash</span><span>${inr(cashPart)}</span></div>` : ''}
    ${onlinePart > 0 ? `<div class="row"><span>Online (Card/UPI)</span><span>${inr(onlinePart)}</span></div>` : ''}
    ${txn.paymentMode === 'CASH'
      ? `<div class="row"><span>Cash received</span><span>${inr(txn.cashReceived ?? txn.grandTotal)}</span></div>
         <div class="row"><span>Change</span><span>${inr(txn.changeGiven ?? 0)}</span></div>`
      : ''}`;

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 72mm; margin: 0 auto; padding: 4mm 2mm 8mm; font-family: 'Courier New', ui-monospace, monospace; font-size: 12px; color: #000; }
  .center { text-align: center; }
  .store { font-size: 16px; font-weight: 700; letter-spacing: 0.5px; }
  .tagline { font-size: 10px; margin-top: 1px; }
  .token { margin: 8px 0 2px; font-size: 11px; }
  .token-num { font-size: 34px; font-weight: 800; line-height: 1; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .meta { font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.name { font-size: 16px; font-weight: 700; padding-top: 4px; line-height: 1.25; }
  tr.sub td { font-size: 11px; }
  .num { text-align: right; white-space: nowrap; }
  .row { display: flex; justify-content: space-between; padding: 1px 0; }
  .total { font-size: 15px; font-weight: 800; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 0; margin: 4px 0; }
  .foot { margin-top: 8px; font-size: 11px; }
  .void { font-size: 18px; font-weight: 800; border: 2px solid #000; padding: 2px 8px; display: inline-block; margin: 6px 0; transform: rotate(-4deg); }
</style>
</head>
<body>
  <div class="center">
    <div class="store">${esc(STORE_NAME)}</div>
    <div class="tagline">${esc(STORE_TAGLINE)}</div>
    ${txn.status === 'VOID' ? '<div class="void">VOID</div>' : ''}
    ${txn.tokenNumber != null ? `<div class="token">TOKEN</div><div class="token-num">#${txn.tokenNumber}</div>` : ''}
  </div>
  <hr />
  <div class="meta">
    <div class="row"><span>Receipt</span><span>${esc(txn.receiptNumber)}</span></div>
    <div class="row"><span>Date</span><span>${format(new Date(txn.soldAt), 'dd MMM yyyy, hh:mm a')}</span></div>
    ${opts.cashierName ? `<div class="row"><span>Cashier</span><span>${esc(opts.cashierName)}</span></div>` : ''}
    ${txn.customerName ? `<div class="row"><span>Customer</span><span>${esc(txn.customerName)}</span></div>` : ''}
  </div>
  <hr />
  <table>${itemsRows}</table>
  <hr />
  <div class="row"><span>Sub-total</span><span>${inr(txn.subTotal)}</span></div>
  ${discountTotal > 0 ? `<div class="row"><span>Discount</span><span>−${inr(discountTotal)}</span></div>` : ''}
  ${Number(txn.taxTotal) > 0 ? `<div class="row"><span>Tax</span><span>${inr(txn.taxTotal)}</span></div>` : ''}
  <div class="row total"><span>TOTAL</span><span>${inr(txn.grandTotal)}</span></div>
  ${payLine}
  <div class="center foot">
    Thank you! Visit again 🙏<br />
    — ${esc(STORE_TAGLINE)} —
  </div>
</body>
</html>`;

  printHtml(html);
}

export interface OrderPickListLine { name: string; unit: string; approvedQty: number; price: number }

/**
 * 80mm thermal pick-list — printed automatically for the admin/godown when they
 * confirm an outlet's stock order, so whoever packs it has a physical copy of
 * exactly what (and how much) was approved.
 */
export function printOrderPickList(
  order: { orderNumber: string; outletName: string; fulfillmentSource: 'MAIN_BRANCH' | 'GODOWN'; isGstBill: boolean },
  lines: OrderPickListLine[],
): void {
  const total = lines.reduce((s, l) => s + l.approvedQty * l.price, 0);
  const itemRows = lines
    .map(
      (l) => `
      <tr><td class="name" colspan="3">${esc(l.name)}</td></tr>
      <tr class="sub"><td>${l.approvedQty} ${esc(l.unit)} × ${inr(l.price)}</td><td></td><td class="num">${inr(l.approvedQty * l.price)}</td></tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 72mm; margin: 0 auto; padding: 4mm 2mm 8mm; font-family: 'Courier New', ui-monospace, monospace; font-size: 12px; color: #000; }
  .center { text-align: center; }
  .store { font-size: 16px; font-weight: 700; letter-spacing: 0.5px; }
  .tagline { font-size: 10px; margin-top: 1px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .meta { font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.name { font-size: 16px; font-weight: 700; padding-top: 4px; line-height: 1.25; }
  tr.sub td { font-size: 11px; }
  .num { text-align: right; white-space: nowrap; }
  .row { display: flex; justify-content: space-between; padding: 1px 0; }
  .total { font-size: 15px; font-weight: 800; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 0; margin: 4px 0; }
</style>
</head>
<body>
  <div class="center">
    <div class="store">${esc(STORE_NAME)}</div>
    <div class="tagline">Order Pick List</div>
  </div>
  <hr />
  <div class="meta">
    <div class="row"><span>Order</span><span>${esc(order.orderNumber)}</span></div>
    <div class="row"><span>Outlet</span><span>${esc(order.outletName)}</span></div>
    <div class="row"><span>Fulfil from</span><span>${order.fulfillmentSource === 'GODOWN' ? 'Godown' : 'Main Branch'}</span></div>
    <div class="row"><span>Confirmed</span><span>${format(new Date(), 'dd MMM yyyy, hh:mm a')}</span></div>
    <div class="row"><span>Bill type</span><span>${order.isGstBill ? 'With GST' : 'No GST'}</span></div>
  </div>
  <hr />
  <table>${itemRows}</table>
  <hr />
  <div class="row total"><span>ESTIMATED TOTAL</span><span>${inr(total)}</span></div>
  <p class="center" style="margin-top:8px;font-size:11px;">Pack &amp; dispatch the quantities above.</p>
</body>
</html>`;

  printHtml(html);
}

export interface ItemReportRow { name: string; category?: string; qty: number; revenue: number }

/**
 * 80mm thermal item-wise sales report — printed straight from the POS terminal
 * (e.g. current session, via the same printer already set up for receipts).
 */
export function printSessionItemReport(rows: ItemReportRow[], meta: { sessionNumber: string; cashierName?: string; openedAt: string }): void {
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const itemRows = rows
    .map(
      (r) => `
      <tr><td class="name" colspan="3">${esc(r.name)}</td></tr>
      <tr class="sub"><td>${r.qty} sold</td><td></td><td class="num">${inr(r.revenue)}</td></tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: 80mm auto; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 72mm; margin: 0 auto; padding: 4mm 2mm 8mm; font-family: 'Courier New', ui-monospace, monospace; font-size: 12px; color: #000; }
  .center { text-align: center; }
  .store { font-size: 16px; font-weight: 700; letter-spacing: 0.5px; }
  .tagline { font-size: 10px; margin-top: 1px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  .meta { font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.name { font-weight: 700; padding-top: 3px; }
  tr.sub td { font-size: 11px; }
  .num { text-align: right; white-space: nowrap; }
  .row { display: flex; justify-content: space-between; padding: 1px 0; }
  .total { font-size: 15px; font-weight: 800; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 0; margin: 4px 0; }
</style>
</head>
<body>
  <div class="center">
    <div class="store">${esc(STORE_NAME)}</div>
    <div class="tagline">Item-wise Sales Report</div>
  </div>
  <hr />
  <div class="meta">
    <div class="row"><span>Session</span><span>${esc(meta.sessionNumber)}</span></div>
    <div class="row"><span>Opened</span><span>${format(new Date(meta.openedAt), 'dd MMM yyyy, hh:mm a')}</span></div>
    ${meta.cashierName ? `<div class="row"><span>Cashier</span><span>${esc(meta.cashierName)}</span></div>` : ''}
    <div class="row"><span>Printed</span><span>${format(new Date(), 'hh:mm a')}</span></div>
  </div>
  <hr />
  ${rows.length ? `<table>${itemRows}</table>` : '<p class="center">No sales yet.</p>'}
  <hr />
  <div class="row"><span>Items sold</span><span>${totalQty}</span></div>
  <div class="row total"><span>TOTAL REVENUE</span><span>${inr(totalRevenue)}</span></div>
</body>
</html>`;

  printHtml(html);
}

/**
 * A4-style item-wise sales report for the back-office analytics screen —
 * every item sold in the period, with category and revenue share.
 */
export function printAnalyticsItemReport(rows: ItemReportRow[], meta: { periodLabel: string; generatedBy?: string }): void {
  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const bodyRows = rows
    .map(
      (r, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td>${esc(r.name)}</td>
        <td>${esc(r.category ?? '—')}</td>
        <td class="num">${r.qty}</td>
        <td class="num">${inr(r.revenue)}</td>
        <td class="num">${totalRevenue > 0 ? ((r.revenue / totalRevenue) * 100).toFixed(1) : '0.0'}%</td>
      </tr>`,
    )
    .join('');

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 14mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; color: #111827; font-size: 12px; }
  h1 { font-size: 20px; margin-bottom: 2px; }
  .sub { color: #6B7280; font-size: 12px; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #E5E7EB; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; color: #6B7280; border-bottom: 2px solid #111827; }
  td.num, th.num { text-align: right; }
  tfoot td { font-weight: 700; border-top: 2px solid #111827; border-bottom: none; }
  tr:nth-child(even) { background: #FAFAFA; }
</style>
</head>
<body>
  <h1>${esc(STORE_NAME)} — Item-wise Sales Report</h1>
  <p class="sub">${esc(meta.periodLabel)}${meta.generatedBy ? ` · Generated by ${esc(meta.generatedBy)}` : ''} · Printed ${format(new Date(), 'dd MMM yyyy, hh:mm a')}</p>
  <table>
    <thead><tr><th class="num">#</th><th>Item</th><th>Category</th><th class="num">Qty</th><th class="num">Revenue</th><th class="num">Share</th></tr></thead>
    <tbody>${bodyRows}</tbody>
    <tfoot><tr><td colspan="3">Total</td><td class="num">${totalQty}</td><td class="num">${inr(totalRevenue)}</td><td class="num">100%</td></tr></tfoot>
  </table>
</body>
</html>`;

  printHtml(html);
}
