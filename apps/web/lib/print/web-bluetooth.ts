'use client';

/**
 * Web Bluetooth (BLE) transport for ESC/POS printers — the no-install path.
 *
 * Chrome on Android (and desktop) exposes BLE GATT only; it cannot open the
 * Bluetooth Classic SPP socket most receipt printers use, which is exactly why
 * the wrapper app exists. But many printers are dual-mode and additionally
 * expose a BLE "serial" service with a writable characteristic. When the
 * printer does, this transport drives it from the plain browser.
 *
 * The service/characteristic UUIDs below cover the BLE bridges found on the
 * common Chinese thermal-printer modules (JK/Goojprt/Xprinter/ISSC/HM-10…).
 */

// ── Minimal Web Bluetooth typings (not in TS's dom lib) ─────────────────────
interface BluetoothRemoteGATTCharacteristicLike {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse?: (data: Uint8Array) => Promise<void>;
  writeValueWithoutResponse?: (data: Uint8Array) => Promise<void>;
  writeValue: (data: Uint8Array) => Promise<void>;
}
interface BluetoothRemoteGATTServiceLike {
  uuid: string;
  getCharacteristics(): Promise<BluetoothRemoteGATTCharacteristicLike[]>;
}
interface BluetoothRemoteGATTServerLike {
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServerLike>;
  disconnect(): void;
  getPrimaryServices(): Promise<BluetoothRemoteGATTServiceLike[]>;
}
export interface BluetoothDeviceLike {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServerLike;
  addEventListener(type: 'gattserverdisconnected', listener: () => void): void;
}
interface BluetoothLike {
  requestDevice(options: {
    filters?: Array<{ services?: Array<string | number>; namePrefix?: string }>;
    acceptAllDevices?: boolean;
    optionalServices?: Array<string | number>;
  }): Promise<BluetoothDeviceLike>;
  getDevices?: () => Promise<BluetoothDeviceLike[]>;
}

function getBluetooth(): BluetoothLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { bluetooth?: BluetoothLike }).bluetooth;
}

export function webBluetoothSupported(): boolean {
  return !!getBluetooth();
}

// ── Known printer BLE services ───────────────────────────────────────────────
const PRINTER_SERVICES: string[] = [
  '000018f0-0000-1000-8000-00805f9b34fb', // common ESC/POS BLE service (char 2af1)
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // "BlueTooth Printer" module (char bef8d6c9)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC/Microchip transparent UART
  '0000ff00-0000-1000-8000-00805f9b34fb', // Xprinter et al.
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 style UART
  '0000fee7-0000-1000-8000-00805f9b34fb', // some Goojprt/JP modules
];

const WRITE_CHUNK = 120;   // safe for un-negotiated MTUs across cheap modules
const CHUNK_DELAY_MS = 15; // pacing for writeWithoutResponse fire-and-forget

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class WebBluetoothPrinter {
  private device: BluetoothDeviceLike | null = null;
  private characteristic: BluetoothRemoteGATTCharacteristicLike | null = null;

  get connectedName(): string | null {
    return this.device?.gatt?.connected ? this.device.name ?? 'BLE printer' : null;
  }

  /**
   * Show the browser's device picker (must be called from a user gesture) and
   * connect. Returns the picked device's id/name for persistence.
   */
  async pick(): Promise<{ id: string; name: string }> {
    const bt = getBluetooth();
    if (!bt) throw new Error('Web Bluetooth is not supported in this browser');
    const device = await bt.requestDevice({
      // Two-stage net: prefer devices advertising a known printer service, but
      // let the user pick anything (some printers advertise no services at all
      // until connected). optionalServices whitelists what we may then access.
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES,
    });
    await this.connectTo(device);
    return { id: device.id, name: device.name ?? 'BLE printer' };
  }

  /**
   * Try to reconnect to a previously-granted device without a picker. Works
   * when the browser supports the persistent-permissions backend
   * (navigator.bluetooth.getDevices); otherwise the user re-picks once per session.
   */
  async reconnectKnown(deviceId: string): Promise<boolean> {
    const bt = getBluetooth();
    if (!bt?.getDevices) return false;
    try {
      const devices = await bt.getDevices();
      const device = devices.find((d) => d.id === deviceId);
      if (!device) return false;
      await this.connectTo(device);
      return true;
    } catch {
      return false;
    }
  }

  private async connectTo(device: BluetoothDeviceLike): Promise<void> {
    if (!device.gatt) throw new Error('Device has no GATT server');
    this.device = device;
    device.addEventListener('gattserverdisconnected', () => { this.characteristic = null; });
    const server = await device.gatt.connect();

    // Find the first writable characteristic under a known printer service.
    const services = await server.getPrimaryServices();
    for (const svc of services) {
      if (!PRINTER_SERVICES.includes(svc.uuid)) continue;
      for (const ch of await svc.getCharacteristics()) {
        if (ch.properties.write || ch.properties.writeWithoutResponse) {
          this.characteristic = ch;
          return;
        }
      }
    }
    device.gatt.disconnect();
    this.characteristic = null;
    throw new Error(
      'No writable printer service found — this printer does not expose BLE printing. Use the SCFC Print Bridge app instead.',
    );
  }

  async ensureConnected(savedDeviceId?: string): Promise<void> {
    if (this.characteristic && this.device?.gatt?.connected) return;
    if (this.device?.gatt && !this.device.gatt.connected) {
      // Session device exists but link dropped (printer power-cycled) — redial.
      await this.connectTo(this.device);
      return;
    }
    if (savedDeviceId && (await this.reconnectKnown(savedDeviceId))) return;
    throw new Error('BLE printer not connected');
  }

  async write(bytes: Uint8Array): Promise<void> {
    const ch = this.characteristic;
    if (!ch || !this.device?.gatt?.connected) throw new Error('BLE printer not connected');
    const useNoResponse = ch.properties.writeWithoutResponse && !!ch.writeValueWithoutResponse;
    for (let i = 0; i < bytes.length; i += WRITE_CHUNK) {
      const chunk = bytes.subarray(i, i + WRITE_CHUNK);
      if (useNoResponse) {
        await ch.writeValueWithoutResponse!(chunk);
        await sleep(CHUNK_DELAY_MS); // let the module's UART buffer drain
      } else if (ch.writeValueWithResponse) {
        await ch.writeValueWithResponse(chunk);
      } else {
        await ch.writeValue(chunk);
      }
    }
  }

  disconnect(): void {
    this.device?.gatt?.disconnect();
    this.characteristic = null;
  }
}

/** Module-level singleton — the till talks to one receipt printer at a time. */
export const webBtPrinter = new WebBluetoothPrinter();
