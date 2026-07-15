'use client';

import type { MonoRaster } from './escpos-encoder';

/**
 * Convert an image URL (e.g. `/logo.png`) into the 1-bit raster format the
 * GS v 0 command prints. Thermal heads are strictly black/white, so grayscale
 * is reduced with Floyd–Steinberg dithering — logos and photos keep their
 * shading instead of collapsing into solid blobs.
 */
export async function loadImageAsRaster(
  src: string,
  opts: { maxWidthDots: number; dither?: boolean; threshold?: number },
): Promise<MonoRaster> {
  const img = await loadImage(src);
  const scale = Math.min(1, opts.maxWidthDots / img.naturalWidth);
  // Raster width must be a multiple of 8 to pack whole bytes.
  const w = Math.max(8, Math.floor((img.naturalWidth * scale) / 8) * 8);
  const h = Math.max(1, Math.round(img.naturalHeight * (w / img.naturalWidth)));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  // Composite over white first — transparent PNG regions must print as paper,
  // not as black (an all-zero alpha pixel would otherwise read as luminance 0).
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3] / 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a);
    gray[i] = lum;
  }

  const threshold = opts.threshold ?? 160;
  if (opts.dither !== false) floydSteinberg(gray, w, h, threshold);

  const widthBytes = w / 8;
  const out = new Uint8Array(widthBytes * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (gray[y * w + x] < threshold) {
        out[y * widthBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return { widthBytes, height: h, data: out };
}

function floydSteinberg(gray: Float32Array, w: number, h: number, threshold: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const old = gray[i];
      const next = old < threshold ? 0 : 255;
      const err = old - next;
      gray[i] = next;
      if (x + 1 < w) gray[i + 1] += (err * 7) / 16;
      if (y + 1 < h) {
        if (x > 0) gray[i + w - 1] += (err * 3) / 16;
        gray[i + w] += (err * 5) / 16;
        if (x + 1 < w) gray[i + w + 1] += (err * 1) / 16;
      }
    }
  }
}

/**
 * Render a line (or wrapped block) of text to a 1-bit raster the printer can print
 * as an image.
 *
 * This is how non-Latin scripts reach the paper: a thermal printer's built-in
 * fonts are single-byte code pages with no Gujarati/Devanagari glyphs, so sending
 * those characters as text bytes prints "????". The browser's canvas, on the other
 * hand, has the device's full Unicode fonts — so we draw the text there and ship
 * the pixels. Latin text stays as native printer text (crisper, faster); only
 * lines that actually contain non-ASCII take this path.
 *
 * Text is drawn crisp (thresholded, not dithered) so small glyphs stay legible.
 */
export function textToRaster(
  text: string,
  opts: { widthDots: number; fontPx?: number; bold?: boolean; align?: 'left' | 'center'; lineGap?: number },
): MonoRaster {
  const fontPx = opts.fontPx ?? 26;
  const align = opts.align ?? 'left';
  const lineHeight = Math.ceil(fontPx * 1.32) + (opts.lineGap ?? 0);
  // Raster width must be a whole number of bytes.
  const W = Math.max(8, Math.floor(opts.widthDots / 8) * 8);

  // Fonts the device is very likely to have; the canvas falls back through the
  // list until one renders the script. Gujarati resolves via Noto on Android.
  const fontStack = `${opts.bold ? '700 ' : '400 '}${fontPx}px "Noto Sans Gujarati","Noto Sans Devanagari","Noto Sans",system-ui,sans-serif`;

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = fontStack;
  const lines = wrapToWidth(measure, text, W);

  const H = Math.max(lineHeight, lines.length * lineHeight);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.font = fontStack;
  ctx.textBaseline = 'middle';
  ctx.textAlign = align;
  const x = align === 'center' ? W / 2 : 0;
  lines.forEach((ln, i) => ctx.fillText(ln, x, i * lineHeight + lineHeight / 2));

  const { data } = ctx.getImageData(0, 0, W, H);
  const widthBytes = W / 8;
  const out = new Uint8Array(widthBytes * H);
  // Anti-aliased edges: anything darker than mid-gray becomes a black dot.
  for (let y = 0; y < H; y++) {
    for (let px = 0; px < W; px++) {
      const i = (y * W + px) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 150) out[y * widthBytes + (px >> 3)] |= 0x80 >> (px & 7);
    }
  }
  return { widthBytes, height: H, data: out };
}

/** Word-wrap by measured pixel width, hard-breaking words wider than the line. */
function wrapToWidth(ctx: CanvasRenderingContext2D, text: string, widthPx: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const trial = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(trial).width <= widthPx) { cur = trial; continue; }
      if (cur) out.push(cur);
      // Word alone too wide → break it character by character.
      if (ctx.measureText(word).width <= widthPx) { cur = word; continue; }
      let chunk = '';
      for (const ch of word) {
        if (ctx.measureText(chunk + ch).width <= widthPx) chunk += ch;
        else { if (chunk) out.push(chunk); chunk = ch; }
      }
      cur = chunk;
    }
    out.push(cur);
  }
  return out.length ? out : [''];
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}
