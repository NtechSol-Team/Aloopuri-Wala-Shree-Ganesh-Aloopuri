'use client';

/**
 * Minimal, dependency-free ESC/POS command encoder.
 *
 * Produces the raw byte stream a thermal receipt printer executes directly.
 * The same bytes work over every transport we support (Android SPP bridge,
 * Web Bluetooth BLE characteristic), because ESC/POS is transport-agnostic —
 * only the pipe differs.
 *
 * Commands used are the classic Epson set supported by effectively every
 * 58/80mm ESC/POS printer (including the TP/MPT/PPT models this project's
 * vendor SDK targets): ESC @, ESC a/E/-, GS !, GS B, ESC d, GS V, ESC p,
 * GS k (barcodes), GS ( k (QR), GS v 0 (raster images).
 */

export type EscPosAlign = 'left' | 'center' | 'right';

export interface MonoRaster {
  /** Width in bytes (8 dots per byte, MSB = leftmost dot). */
  widthBytes: number;
  height: number;
  /** widthBytes × height bytes, row-major, 1 bit = black dot. */
  data: Uint8Array;
}

/**
 * Thermal printers speak single-byte code pages, not UTF-8. Receipts here are
 * ASCII ("Rs" amounts, English product names), so we transliterate the few
 * common typographic characters and replace anything else non-ASCII with '?'
 * rather than let the printer render garbage.
 */
const CHAR_MAP: Record<string, string> = {
  '₹': 'Rs ', '₨': 'Rs ', '—': '-', '–': '-', '−': '-',
  '‘': "'", '’': "'", '‚': "'", '“': '"', '”': '"', '„': '"',
  '…': '...', '×': 'x', '÷': '/', ' ': ' ', '•': '*', '·': '.',
};

function toBytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const mapped = CHAR_MAP[ch] ?? ch;
    for (const c of mapped) {
      const code = c.codePointAt(0)!;
      if (code === 0x0a || (code >= 0x20 && code <= 0x7e)) out.push(code);
      else if (code > 0x7e) out.push(0x3f); // '?'
      // control chars other than \n are dropped — they'd be executed as commands
    }
  }
  return out;
}

/** Greedy word-wrap that falls back to hard breaks for words longer than the line. */
export function wrapText(s: string, width: number): string[] {
  const lines: string[] = [];
  for (const para of s.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!cur.length) cur = word;
      else if (cur.length + 1 + word.length <= width) cur += ' ' + word;
      else { lines.push(cur); cur = word; }
      while (cur.length > width) { lines.push(cur.slice(0, width)); cur = cur.slice(width); }
    }
    lines.push(cur);
  }
  return lines.length ? lines : [''];
}

export class EscPosEncoder {
  /** Characters per line in Font A (48 for 80mm paper, 32 for 58mm). */
  readonly cols: number;
  private buf: number[] = [];

  constructor(opts: { cols?: number } = {}) {
    this.cols = opts.cols ?? 48;
  }

  raw(bytes: number[] | Uint8Array): this {
    for (const b of bytes) this.buf.push(b & 0xff);
    return this;
  }

  /** ESC @ — reset formatting state, then select standard code page. */
  init(): this {
    return this.raw([0x1b, 0x40, /* ESC t 0 → CP437 */ 0x1b, 0x74, 0x00]);
  }

  text(s: string): this { return this.raw(toBytes(s)); }

  line(s = ''): this { return this.text(s).raw([0x0a]); }

  align(a: EscPosAlign): this {
    return this.raw([0x1b, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0]);
  }

  bold(on: boolean): this { return this.raw([0x1b, 0x45, on ? 1 : 0]); }

  underline(on: boolean): this { return this.raw([0x1b, 0x2d, on ? 1 : 0]); }

  /** GS B — white-on-black, useful for VOID banners. */
  invert(on: boolean): this { return this.raw([0x1d, 0x42, on ? 1 : 0]); }

  /** GS ! — character cell magnification, 1–8 in each axis. */
  size(w: number, h: number): this {
    const clamp = (v: number) => Math.max(0, Math.min(7, Math.round(v) - 1));
    return this.raw([0x1d, 0x21, (clamp(w) << 4) | clamp(h)]);
  }

  /** Both-ends line within `cols` chars; wraps the left part if it overflows. */
  leftRight(left: string, right: string): this {
    const rightLen = right.length;
    const leftWidth = Math.max(1, this.cols - rightLen - 1);
    const leftLines = wrapText(left, leftWidth);
    for (let i = 0; i < leftLines.length - 1; i++) this.line(leftLines[i]);
    const last = leftLines[leftLines.length - 1];
    const pad = Math.max(1, this.cols - last.length - rightLen);
    return this.line(last + ' '.repeat(pad) + right);
  }

  divider(ch = '-'): this { return this.line(ch.repeat(this.cols)); }

  /** ESC d — print buffered line and feed n lines. */
  feed(n = 1): this { return this.raw([0x1b, 0x64, Math.max(0, Math.min(255, n))]); }

  /**
   * GS V 66 n — partial cut with pre-feed. Printers without a cutter ignore it,
   * so it is always safe to send.
   */
  cut(): this { return this.raw([0x1d, 0x56, 0x42, 0x03]); }

  /** ESC p — cash-drawer kick pulse on pin 2 (standard RJ11 drawer). */
  drawer(): this { return this.raw([0x1b, 0x70, 0x00, 0x19, 0xfa]); }

  /**
   * GS ( k — model 2 QR code. `size` is the module dot width (1–16),
   * `ecc` the error-correction level.
   */
  qr(data: string, opts: { size?: number; ecc?: 'L' | 'M' | 'Q' | 'H' } = {}): this {
    const bytes = toBytes(data);
    const size = Math.max(1, Math.min(16, opts.size ?? 6));
    const eccByte = { L: 48, M: 49, Q: 50, H: 51 }[opts.ecc ?? 'M'];
    const storeLen = bytes.length + 3;
    return this
      .raw([0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]) // model 2
      .raw([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size])
      .raw([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, eccByte])
      .raw([0x1d, 0x28, 0x6b, storeLen & 0xff, (storeLen >> 8) & 0xff, 0x31, 0x50, 0x30])
      .raw(bytes)
      .raw([0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30]); // print
  }

  /**
   * GS k — 1D barcode. CODE128 accepts any ASCII (encoded as Code B);
   * EAN13 needs 12–13 digits.
   */
  barcode(
    data: string,
    opts: { type?: 'CODE128' | 'EAN13'; height?: number; width?: number; hri?: boolean } = {},
  ): this {
    const type = opts.type ?? 'CODE128';
    this.raw([0x1d, 0x48, opts.hri === false ? 0 : 2]); // HRI below
    this.raw([0x1d, 0x68, Math.max(24, Math.min(255, opts.height ?? 64))]);
    this.raw([0x1d, 0x77, Math.max(2, Math.min(4, opts.width ?? 2))]);
    if (type === 'EAN13') {
      const digits = data.replace(/\D/g, '').slice(0, 13);
      if (digits.length < 12) return this; // invalid — skip rather than jam the printer
      return this.raw([0x1d, 0x6b, 67, digits.length]).raw(toBytes(digits));
    }
    const payload = toBytes(data).slice(0, 60);
    // Code B prefix "{B" tells the printer which CODE128 sub-alphabet follows.
    return this.raw([0x1d, 0x6b, 73, payload.length + 2, 0x7b, 0x42]).raw(payload);
  }

  /** GS v 0 — print a pre-packed monochrome raster at native resolution. */
  imageRaster(img: MonoRaster): this {
    const { widthBytes, height, data } = img;
    this.raw([
      0x1d, 0x76, 0x30, 0x00,
      widthBytes & 0xff, (widthBytes >> 8) & 0xff,
      height & 0xff, (height >> 8) & 0xff,
    ]);
    return this.raw(data);
  }

  encode(): Uint8Array { return new Uint8Array(this.buf); }
}
