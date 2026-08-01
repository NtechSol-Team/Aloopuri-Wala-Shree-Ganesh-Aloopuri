'use client';

import toast from 'react-hot-toast';
import { androidPrinter, hasAndroidBridge } from './android-bridge';
import { webBluetoothSupported, webBtPrinter } from './web-bluetooth';
import { getPrinterSettings, type PrinterSettings } from './printer-settings';

export type RawTransport = 'android' | 'webbt';

export interface PrintResult {
  ok: boolean;
  /** Machine-readable failure kind so callers can decide how loud to be. */
  code?: 'no-printer' | 'paper-out' | 'cover-open' | 'write-failed' | 'unsupported';
  error?: string;
}

/**
 * Which raw-bytes transport should handle printing right now, or null when
 * documents should go through the browser's print dialog (HTML path).
 */
export function resolveRawTransport(s: PrinterSettings = getPrinterSettings()): RawTransport | null {
  switch (s.transport) {
    case 'system':
      return null;
    case 'android':
      return hasAndroidBridge() ? 'android' : null;
    case 'webbt':
      return webBluetoothSupported() ? 'webbt' : null;
    case 'auto':
    default:
      // Inside the wrapper app the bridge always wins — it talks Bluetooth
      // Classic via the vendor SDK. Otherwise use Web Bluetooth only if this
      // till has completed a BLE printer setup before (never surprise-pick).
      if (hasAndroidBridge()) return 'android';
      if (webBluetoothSupported() && (s.webBtDeviceId || webBtPrinter.connectedName)) return 'webbt';
      return null;
  }
}

/**
 * Send ESC/POS bytes through the active raw transport, reconnecting to the
 * remembered printer when the link has dropped (printer power-cycled, tablet
 * slept, etc.). Includes a best-effort paper/cover pre-check on the bridge.
 */
export async function printRaw(bytes: Uint8Array, opts: { statusCheck?: boolean } = {}): Promise<PrintResult> {
  const s = getPrinterSettings();
  const transport = resolveRawTransport(s);

  if (transport === 'android') {
    try {
      // Bytes go out FIRST. The paper/cover status query is two Bluetooth
      // round-trips into the vendor SDK (easily 0.5–1s each) — running it
      // before the write was the visible gap between tapping Charge and the
      // printer starting. It now runs in the background after dispatch: a
      // healthy printer is already printing by the time it answers, and a
      // paper-out printer (which prints nothing) still gets its toast a
      // moment later.
      await androidPrinter.write(bytes);
      if (opts.statusCheck !== false) {
        void androidPrinter
          .getStatus()
          .then((st) => {
            if (st?.paperOut) toast.error('Printer is out of paper', { id: 'print-error' });
            else if (st?.coverOpen) toast.error('Printer cover is open', { id: 'print-error' });
          })
          .catch(() => { /* unknown status (older firmware) — the print already went out */ });
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        code: /no printer|not connected|no_printer/i.test(msg) ? 'no-printer' : 'write-failed',
        error: msg,
      };
    }
  }

  if (transport === 'webbt') {
    try {
      await webBtPrinter.ensureConnected(s.webBtDeviceId);
      await webBtPrinter.write(bytes);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Logged as well as returned: callers only surface `error` as a toast, so
      // without this the stack and the preceding [print/ble] trace are lost.
      console.error('[print/ble] printRaw failed', e);
      return {
        ok: false,
        code: /not connected/i.test(msg) ? 'no-printer' : 'write-failed',
        error: msg,
      };
    }
  }

  console.warn('[print] no raw transport available — transport setting is', s.transport);
  return { ok: false, code: 'unsupported', error: 'No Bluetooth printer transport available' };
}
