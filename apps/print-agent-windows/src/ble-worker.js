'use strict';

// Main-process side of the BLE transport.
//
// Electron ships Web Bluetooth but deliberately no device chooser UI: when a
// renderer calls requestDevice(), the 'select-bluetooth-device' event fires
// here instead, repeatedly, as devices are discovered -- and the call hangs
// until we answer it with a device id. So this module keeps the discovered
// list, hands it to the Settings window to display, and answers once the user
// has picked. That is the piece that makes a BLE printer selectable at all.
//
// requestDevice() also requires a user gesture, which a hidden window can't
// produce -- hence executeJavaScript(..., true), whose second argument tells
// Electron to treat the call as user-initiated.

const path = require('node:path');
const { BrowserWindow } = require('electron');

let win = null;
/** Answer for the in-flight chooser, held between 'select-bluetooth-device' firings. */
let pendingChooserCallback = null;
let discovered = [];
/** Called with the running device list so Settings can render it live. */
let onDevices = () => {};

function create() {
  if (win && !win.isDestroyed()) return win;
  win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // No preload needed: main drives this window entirely through
      // executeJavaScript and reads the returned promise values.
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'ble.html'));

  win.webContents.on('select-bluetooth-device', (event, deviceList, callback) => {
    event.preventDefault();
    // Fires again on every new discovery; the latest callback is the live one.
    pendingChooserCallback = callback;
    discovered = deviceList.map((d) => ({ deviceId: d.deviceId, deviceName: d.deviceName || '(unnamed)' }));
    onDevices(discovered);
  });

  return win;
}

function setDeviceListener(fn) {
  onDevices = typeof fn === 'function' ? fn : () => {};
}

/**
 * executeJavaScript rejects with the renderer's raw error object, and a
 * DOMException (which is what a cancelled chooser or a dropped GATT link
 * throws) survives that trip as "[object Object]" -- useless in a toast. This
 * pulls a readable message back out, and names the cancel case explicitly
 * since that one isn't a fault at all.
 */
async function run(win, expr, userGesture = true) {
  let result;
  try {
    result = await win.webContents.executeJavaScript(expr, userGesture);
  } catch (err) {
    // Only reached if the expression itself blew up (syntax, window gone) --
    // the BLE calls resolve with an envelope rather than rejecting.
    const raw = err && (err.message || err.name);
    throw new Error(raw && raw !== '[object Object]' ? String(raw) : 'BLE call failed');
  }
  // status() returns a plain object; the rest return the {ok,...} envelope.
  if (!result || typeof result !== 'object' || !('ok' in result)) return result;
  if (result.ok) return result.value;

  const text = String(result.error || 'BLE call failed');
  if (/user cancell?ed|chooser|NotFoundError/i.test(text)) {
    throw new Error('Scan cancelled — no printer was picked.');
  }
  throw new Error(text);
}

async function ready() {
  const w = create();
  if (w.webContents.isLoading()) {
    await new Promise((resolve) => w.webContents.once('did-finish-load', resolve));
  }
  return w;
}

/**
 * Opens the chooser. Resolves only once the user picks (via choose()) and the
 * printer connects, so callers should expect this to sit pending for a while.
 */
async function startScan({ allDevices = false } = {}) {
  const w = await ready();
  discovered = [];
  return run(w, `window.__ble.pick(${allDevices ? 'true' : 'false'})`);
}

/** Answers the pending chooser with the user's choice; '' cancels the scan. */
function choose(deviceId) {
  if (!pendingChooserCallback) return false;
  const cb = pendingChooserCallback;
  pendingChooserCallback = null;
  cb(deviceId || '');
  return true;
}

function cancelScan() {
  return choose('');
}

async function reconnect(savedDeviceId) {
  const w = await ready();
  return run(w, `window.__ble.reconnect(${JSON.stringify(savedDeviceId)})`);
}

async function status() {
  if (!win || win.isDestroyed()) return { connected: false, name: null };
  const w = await ready();
  return run(w, 'window.__ble.status()', false);
}

/** Sends ESC/POS bytes over BLE. Buffer -> base64 keeps the IPC payload small. */
async function print(buffer, savedDeviceId) {
  const w = await ready();
  const b64 = Buffer.from(buffer).toString('base64');
  return run(w, `window.__ble.print(${JSON.stringify(b64)}, ${JSON.stringify(savedDeviceId || '')})`);
}

module.exports = { create, ready, setDeviceListener, startScan, choose, cancelScan, reconnect, status, print };
