'use strict';

// Two-stage printing, matching the brief:
//   1. node-thermal-printer builds the ESC/POS byte buffer -- formatting only,
//      never actually sent through it (getBuffer(), never execute()).
//   2. The bytes are handed off ourselves:
//        - USB or Bluetooth printer -> either way it's installed as a normal
//          Windows printer queue (Bluetooth pairs as one, USB installs a
//          driver for one), so both go through RawPrint.ps1 -- a bundled
//          PowerShell script that P/Invokes winspool.drv directly (the
//          classic Microsoft RawPrinterHelper pattern) to push the bytes past
//          the driver untouched. No native Node addon: the obvious one for
//          this (the `printer` npm package) is unmaintained and fails to even
//          install on any machine with Python >=3.12 (distutils was removed),
//          which would undermine the entire point of shipping a one-click
//          installer. PowerShell + Add-Type needs nothing but Windows itself.
//        - LAN thermal printer -> a raw TCP write straight to the printer's
//          IP:port (almost always 9100), no OS driver involved at all.
const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { app } = require('electron');
const { execFile } = require('node:child_process');
const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
const configStore = require('./config-store');

function rawPrintScriptPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'RawPrint.ps1')
    : path.join(__dirname, '..', 'resources', 'RawPrint.ps1');
}

function runPowerShell(args, { timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args],
      { timeout, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr?.trim() || err.message));
        resolve(stdout);
      },
    );
  });
}

/** Every printer Windows currently knows about (USB, Bluetooth, and any installed network printer queues). */
async function listPrinters() {
  if (process.platform !== 'win32') return [];
  try {
    const stdout = await runPowerShell([
      '-Command',
      'Get-Printer | Select-Object Name,PrinterStatus,@{n="isDefault";e={(Get-CimInstance Win32_Printer -Filter "Name=\'$($_.Name -replace \'\\\\\',\'\\\\\\\\\')\'" ).Default}} | ConvertTo-Json -Compress',
    ]);
    const parsed = JSON.parse(stdout || '[]');
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.filter(Boolean).map((p) => ({ name: p.Name, status: String(p.PrinterStatus ?? ''), isDefault: !!p.isDefault }));
  } catch (err) {
    console.error('[printer] failed to enumerate printers', err.message);
    return [];
  }
}

/** Builds the raw ESC/POS bytes for a receipt. `lines` is a small formatting DSL (see receipt-builder.js). */
function buildEscPosBuffer(lines, { paperWidth } = {}) {
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    // Unused -- see the file header, we only ever call getBuffer().
    interface: 'tcp://127.0.0.1:9100',
    width: paperWidth || 48,
    removeSpecialCharacters: false,
    options: { timeout: 3000 },
  });

  for (const line of lines) {
    switch (line.type) {
      case 'text': {
        if (line.bold) printer.bold(true);
        if (line.align === 'center') printer.alignCenter();
        else if (line.align === 'right') printer.alignRight();
        else printer.alignLeft();
        // 'huge' = double width AND height (mirrors receipt-escpos.ts's size(2,2) on
        // the store name); 'tall' = double height only (mirrors its {tall: true} on
        // item names -- readable across the counter without halving the line width).
        if (line.size === 'huge') printer.setTextQuadArea();
        else if (line.size === 'tall') printer.setTextDoubleHeight();
        printer.println(line.text);
        if (line.size) printer.setTextNormal();
        if (line.bold) printer.bold(false);
        break;
      }
      case 'row':
        printer.alignLeft();
        if (line.bold) printer.bold(true);
        printer.leftRight(line.left, line.right);
        if (line.bold) printer.bold(false);
        break;
      case 'divider':
        printer.drawLine();
        break;
      case 'feed':
        printer.newLine();
        break;
      default:
        break;
    }
  }
  printer.cut();
  return printer.getBuffer();
}

/** Sends already-built ESC/POS bytes to whatever this agent is configured to print to. */
function sendToConfiguredPrinter(buffer) {
  const cfg = configStore.getConfig();
  if (cfg.printerInterface === 'network') {
    return sendOverNetwork(buffer, cfg.printerNetworkAddress);
  }
  return sendToWindowsQueue(buffer, cfg.printerName);
}

async function sendToWindowsQueue(buffer, printerName) {
  if (!printerName) throw new Error('No printer selected. Open the tray menu -> Select Printer.');
  if (process.platform !== 'win32') {
    throw new Error('USB/Bluetooth printing goes through the Windows print spooler and only works on Windows.');
  }
  const tempFile = path.join(os.tmpdir(), `scfc-print-${crypto.randomUUID()}.bin`);
  fs.writeFileSync(tempFile, buffer);
  try {
    await runPowerShell(['-File', rawPrintScriptPath(), '-PrinterName', printerName, '-FilePath', tempFile]);
  } finally {
    fs.unlink(tempFile, () => {});
  }
}

function sendOverNetwork(buffer, address) {
  return new Promise((resolve, reject) => {
    if (!address || !address.includes(':')) {
      return reject(new Error('Network printer address must be "host:port" (e.g. 192.168.1.50:9100).'));
    }
    const [host, portStr] = address.split(':');
    const port = Number(portStr);
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out connecting to ${address}`));
    }, 5000);
    socket.connect(port, host, () => {
      socket.write(buffer, (err) => {
        clearTimeout(timer);
        socket.end();
        if (err) reject(err);
        else resolve();
      });
    });
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

module.exports = { listPrinters, buildEscPosBuffer, sendToConfiguredPrinter };
