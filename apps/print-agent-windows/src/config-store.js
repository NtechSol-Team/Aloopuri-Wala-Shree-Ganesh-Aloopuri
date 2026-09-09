'use strict';

// Everything the app needs to remember between restarts:
//  - server URL + selected printer (electron-store -> plain JSON on disk, fine
//    since none of it is secret)
//  - the refresh token from login (encrypted at rest via Electron's OS-level
//    safeStorage -- Credential Manager on Windows -- since unlike the URL/printer
//    name, this is a real credential and shouldn't sit in plaintext JSON)
const Store = require('electron-store');
const { safeStorage } = require('electron');

const store = new Store({
  name: 'print-agent-config',
  defaults: {
    serverUrl: '',
    printerName: '',
    // 'system'  -> Windows printer queue (USB / Bluetooth installed as a printer)
    // 'network' -> raw TCP to a LAN thermal printer
    // 'ble'     -> Web Bluetooth, the same transport the POS uses for BLE
    //              printers, which never appear as Windows printers at all
    // 'usb-raw' -> a USB printer with no Windows driver at all, reached via a
    //              bundled vendor DLL instead -- see UsbRawPrint.ps1. Needs no
    //              extra config (no name/port/id): it finds the printer itself.
    printerInterface: 'system',
    printerNetworkAddress: '', // "host:port" when printerInterface === 'network'
    bleDeviceId: '', // Web Bluetooth device id when printerInterface === 'ble'
    bleDeviceName: '',
    paperWidth: 48, // characters per line at the configured font -- 80mm printers, 42/58mm should use ~32
    userIdentifier: '', // email or user code last used to log in, shown back in Settings
    encryptedRefreshToken: null, // Buffer, written by saveRefreshToken()
  },
});

function getConfig() {
  const raw = store.store;
  return {
    serverUrl: raw.serverUrl,
    printerName: raw.printerName,
    printerInterface: raw.printerInterface,
    printerNetworkAddress: raw.printerNetworkAddress,
    bleDeviceId: raw.bleDeviceId,
    bleDeviceName: raw.bleDeviceName,
    paperWidth: raw.paperWidth,
    userIdentifier: raw.userIdentifier,
    hasSavedLogin: !!raw.encryptedRefreshToken,
  };
}

function setServerUrl(url) {
  store.set('serverUrl', url.trim().replace(/\/+$/, ''));
}

function setPrinter({ printerName, printerInterface, printerNetworkAddress, bleDeviceId, bleDeviceName, paperWidth }) {
  if (printerName !== undefined) store.set('printerName', printerName);
  if (printerInterface !== undefined) store.set('printerInterface', printerInterface);
  if (printerNetworkAddress !== undefined) store.set('printerNetworkAddress', printerNetworkAddress);
  if (bleDeviceId !== undefined) store.set('bleDeviceId', bleDeviceId);
  if (bleDeviceName !== undefined) store.set('bleDeviceName', bleDeviceName);
  if (paperWidth !== undefined) store.set('paperWidth', paperWidth);
}

/** Encrypts and persists the refresh token issued at login. Cleared on logout/reconfigure. */
function saveRefreshToken(refreshToken, userIdentifier) {
  if (!safeStorage.isEncryptionAvailable()) {
    // Extremely rare (no OS keychain backend) -- storing plaintext beats not
    // remembering the login at all and forcing a re-type on every boot, but
    // it's worth knowing about.
    console.warn('[config] OS-level encryption unavailable; storing refresh token unencrypted.');
    store.set('encryptedRefreshToken', Buffer.from(refreshToken, 'utf8').toString('base64'));
  } else {
    store.set('encryptedRefreshToken', safeStorage.encryptString(refreshToken).toString('base64'));
  }
  store.set('userIdentifier', userIdentifier || '');
}

function loadRefreshToken() {
  const b64 = store.get('encryptedRefreshToken');
  if (!b64) return null;
  const buf = Buffer.from(b64, 'base64');
  try {
    if (safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(buf);
    return buf.toString('utf8');
  } catch (err) {
    console.error('[config] failed to decrypt saved refresh token, clearing it', err);
    store.set('encryptedRefreshToken', null);
    return null;
  }
}

function clearLogin() {
  store.set('encryptedRefreshToken', null);
  store.set('userIdentifier', '');
}

module.exports = { getConfig, setServerUrl, setPrinter, saveRefreshToken, loadRefreshToken, clearLogin };
