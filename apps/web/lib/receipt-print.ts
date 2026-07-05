'use client';

import { format } from 'date-fns';
import type { PosTxn } from '@/hooks/usePos';

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
  const payLine =
    txn.paymentMode === 'CASH'
      ? `<div class="row"><span>Cash received</span><span>${inr(txn.cashReceived ?? txn.grandTotal)}</span></div>
         <div class="row"><span>Change</span><span>${inr(txn.changeGiven ?? 0)}</span></div>`
      : `<div class="row"><span>Paid via</span><span>${txn.paymentMode}</span></div>`;

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
  td.name { font-weight: 700; padding-top: 3px; }
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
