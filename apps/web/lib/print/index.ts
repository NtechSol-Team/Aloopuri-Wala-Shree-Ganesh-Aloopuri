'use client';

import toast from 'react-hot-toast';
import type { PosTxn } from '@/hooks/usePos';
import {
  printReceipt as printReceiptHtml,
  printOrderPickList as printOrderPickListHtml,
  printSessionItemReport as printSessionItemReportHtml,
  type OrderPickListLine,
  type ItemReportRow,
  type StoreProfile,
} from '@/lib/receipt-print';
import { getPrinterSettings } from './printer-settings';
import { resolveRawTransport, printRaw, type PrintResult } from './print-manager';
import { receiptBytes, pickListBytes, sessionReportBytes } from './receipt-escpos';

/**
 * Smart print entry points — same signatures the UI always used, but now
 * transport-aware:
 *
 *   • Android wrapper app / Web Bluetooth printer configured → generate
 *     ESC/POS bytes and send them over Bluetooth directly (no print dialog).
 *   • Otherwise → the original hidden-iframe + window.print() HTML path,
 *     which is what Windows tills with driver-installed printers use.
 *
 * Call sites stay fire-and-forget; failures surface as toasts because the
 * cashier's next action ("check the printer") is the same regardless of caller.
 */

function notifyFailure(res: PrintResult): void {
  const hint =
    res.code === 'paper-out' ? 'Printer is out of paper.'
    : res.code === 'cover-open' ? 'Printer cover is open.'
    : res.code === 'no-printer' ? 'No printer connected — open Printer Settings and connect one.'
    : `Print failed: ${res.error ?? 'unknown error'}`;
  toast.error(hint, { id: 'print-error' }); // stable id: an auto-print retry storm shows one toast, not five
}

export function printReceipt(txn: PosTxn, opts: { cashierName?: string; store?: StoreProfile } = {}): void {
  if (!resolveRawTransport()) return printReceiptHtml(txn, opts);
  void (async () => {
    const bytes = await receiptBytes(txn, opts, getPrinterSettings());
    const res = await printRaw(bytes);
    if (!res.ok) notifyFailure(res);
  })();
}

export function printOrderPickList(
  order: { orderNumber: string; outletName: string; fulfillmentSource: 'MAIN_BRANCH' | 'GODOWN'; isGstBill: boolean },
  lines: OrderPickListLine[],
): void {
  if (!resolveRawTransport()) return printOrderPickListHtml(order, lines);
  void (async () => {
    const res = await printRaw(pickListBytes(order, lines, getPrinterSettings()));
    if (!res.ok) notifyFailure(res);
  })();
}

export function printSessionItemReport(
  rows: ItemReportRow[],
  meta: { sessionNumber: string; cashierName?: string; openedAt: string; store?: StoreProfile },
): void {
  if (!resolveRawTransport()) return printSessionItemReportHtml(rows, meta);
  void (async () => {
    const res = await printRaw(sessionReportBytes(rows, meta, getPrinterSettings()));
    if (!res.ok) notifyFailure(res);
  })();
}

// Unchanged pass-throughs so POS components can import everything from one place.
export { getAutoPrint, setAutoPrint, DEFAULT_STORE, type StoreProfile } from '@/lib/receipt-print';
