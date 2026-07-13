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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}
