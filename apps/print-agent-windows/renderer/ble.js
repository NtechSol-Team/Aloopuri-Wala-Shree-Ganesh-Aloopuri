'use strict';

/**
 * Web Bluetooth (BLE) transport, living in a hidden renderer.
 *
 * Why a renderer at all, when every other transport in this app runs in the
 * main process: navigator.bluetooth only exists in a renderer. So this window
 * stays open (hidden) for the life of the app, owns the GATT link, and the
 * main process drives it through executeJavaScript.
 *
 * The logic is a port of the POS's apps/web/lib/print/web-bluetooth.ts -- same
 * service UUIDs, same chunked writes, same reconnect-and-retry behaviour --
 * because it is the same class of printer at the other end. Keep the two in
 * step when either changes.
 */

const PRINTER_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // common ESC/POS BLE service (char 2af1)
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // "BlueTooth Printer" module (char bef8d6c9)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC/Microchip transparent UART
  '0000ff00-0000-1000-8000-00805f9b34fb', // Xprinter et al.
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 style UART
  '0000fee7-0000-1000-8000-00805f9b34fb', // some Goojprt/JP modules
];
const PRINTER_NAME_PREFIXES = ['RP', 'RPP', 'TVS', 'PT-', 'POS', 'XP-', 'MTP', 'MPT', 'GP-', 'JP', 'BlueTooth Printer', 'Printer'];

const WRITE_CHUNK = 120;
const CHUNK_DELAY_MS = 15;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.info('[ble]', ...a);

let device = null;
let characteristic = null;

function isLinkDropError(e) {
  const msg = e instanceof Error ? e.message : String(e);
  return /gatt server is disconnected|cannot retrieve services|connection.*(lost|failed)|device is not connected/i.test(msg);
}

async function connectOnce(dev) {
  if (!dev.gatt) throw new Error('Device has no GATT server');
  device = dev;
  const server = await dev.gatt.connect();
  const services = await server.getPrimaryServices();
  log('services:', services.map((s) => s.uuid).join(', ') || '(none)');

  const candidates = [];
  for (const svc of services) {
    if (!PRINTER_SERVICES.includes(svc.uuid)) continue;
    for (const ch of await svc.getCharacteristics()) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) candidates.push({ svc, ch });
    }
  }
  const picked = candidates[0];
  if (!picked) {
    dev.gatt.disconnect();
    characteristic = null;
    throw new Error('No writable printer service found — this printer does not expose BLE printing.');
  }
  characteristic = picked.ch;
  log('using characteristic', picked.ch.uuid, 'on', picked.svc.uuid);

  // Some bridge modules only relay writes once a client subscribes to notify.
  try {
    const chs = await picked.svc.getCharacteristics();
    const notifyCh = chs.find((c) => c.properties.notify || c.properties.indicate);
    if (notifyCh && notifyCh.startNotifications) await notifyCh.startNotifications();
  } catch { /* never block printing on this */ }
}

/** connect + discover, retried — these modules drop the link mid-handshake. */
async function connectTo(dev, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    try {
      await connectOnce(dev);
      return;
    } catch (e) {
      if (attempt >= attempts || !isLinkDropError(e)) throw e;
      try { dev.gatt && dev.gatt.disconnect(); } catch { /* already gone */ }
      await sleep(250 * attempt);
    }
  }
}

async function findKnownDevice(deviceId) {
  if (!navigator.bluetooth.getDevices) return null;
  const devices = await navigator.bluetooth.getDevices();
  return devices.find((d) => d.id === deviceId) || null;
}

async function ensureConnected(savedDeviceId) {
  if (characteristic && device && device.gatt && device.gatt.connected) return;
  if (device && device.gatt && !device.gatt.connected) {
    await connectTo(device);
    return;
  }
  if (savedDeviceId) {
    const known = await findKnownDevice(savedDeviceId);
    if (known) {
      await connectTo(known);
      return;
    }
  }
  throw new Error('BLE printer not connected — pick it again in Settings.');
}

async function writeBytes(bytes) {
  const ch = characteristic;
  if (!ch || !device || !device.gatt || !device.gatt.connected) throw new Error('BLE printer not connected');
  const useNoResponse = ch.properties.writeWithoutResponse && !!ch.writeValueWithoutResponse;
  let sent = 0;
  for (let i = 0; i < bytes.length; i += WRITE_CHUNK) {
    if (!device.gatt.connected) throw new Error(`link dropped mid-write after ${sent}/${bytes.length} bytes`);
    const chunk = bytes.subarray(i, i + WRITE_CHUNK);
    if (useNoResponse) {
      await ch.writeValueWithoutResponse(chunk);
      await sleep(CHUNK_DELAY_MS);
    } else if (ch.writeValueWithResponse) {
      await ch.writeValueWithResponse(chunk);
    } else {
      await ch.writeValue(chunk);
    }
    sent += chunk.length;
  }
  log(`wrote ${sent} bytes`);
}

/**
 * A rejected DOMException does not survive executeJavaScript -- it arrives in
 * main as "[object Object]" with nothing readable on it. So every entry point
 * below resolves with plain {ok,...} data and never throws; main turns a
 * {ok:false} back into a real Error with the message intact.
 */
function ok(value) { return { ok: true, value }; }
function failed(e) {
  const msg = (e && (e.message || e.name)) ? (e.message || e.name) : String(e);
  return { ok: false, error: msg };
}

window.__ble = {
  supported: () => !!navigator.bluetooth,

  /**
   * Opens the chooser. Main handles select-bluetooth-device and feeds the
   * discovered list to Settings for the user to pick from, so this promise
   * resolves once they have.
   */
  async pick(allDevices) {
   try {
    const options = allDevices
      ? { acceptAllDevices: true, optionalServices: PRINTER_SERVICES }
      : {
          filters: [
            ...PRINTER_SERVICES.map((s) => ({ services: [s] })),
            ...PRINTER_NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
          ],
          optionalServices: PRINTER_SERVICES,
        };
    const dev = await navigator.bluetooth.requestDevice(options);
    await connectTo(dev);
    return ok({ id: dev.id, name: dev.name || 'BLE printer' });
   } catch (e) { return failed(e); }
  },

  /** Reconnect to the saved printer without a chooser, if the OS still grants it. */
  async reconnect(savedDeviceId) {
    try {
      await ensureConnected(savedDeviceId);
      return ok({ id: device.id, name: device.name || 'BLE printer' });
    } catch (e) { return failed(e); }
  },

  status: () => ({
    connected: !!(characteristic && device && device.gatt && device.gatt.connected),
    name: device ? device.name || 'BLE printer' : null,
  }),

  /** base64 in (IPC-friendly), bytes out to the printer, with one stale-link retry. */
  async print(base64, savedDeviceId) {
   try {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    await ensureConnected(savedDeviceId);
    try {
      await writeBytes(bytes);
      return ok(true);
    } catch (e) {
      if (!isLinkDropError(e) && !/not connected|link dropped/i.test(e instanceof Error ? e.message : String(e))) throw e;
      log('stale link — rebuilding and retrying once');
    }
    characteristic = null;
    try { device && device.gatt && device.gatt.disconnect(); } catch { /* already gone */ }
    await sleep(200);
    await ensureConnected(savedDeviceId);
    await writeBytes(bytes);
    return ok(true);
   } catch (e) { return failed(e); }
  },
};

log('BLE worker ready, supported =', !!navigator.bluetooth);
