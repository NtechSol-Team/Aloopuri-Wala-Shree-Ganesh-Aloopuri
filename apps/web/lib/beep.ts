'use client';

/**
 * Tiny synthesized UI sounds via WebAudio — no audio assets needed.
 * Safe to call anywhere; silently no-ops if the AudioContext is unavailable
 * (e.g. before any user gesture on iOS).
 */

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, durationMs: number, startMs = 0, volume = 0.08): void {
  const ac = audioCtx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t0 = ac.currentTime + startMs / 1000;
  const t1 = t0 + durationMs / 1000;
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t1);
}

/** Short blip — item added to cart. */
export function beepAdd(): void {
  tone(880, 70);
}

/** Rising two-tone — sale completed. */
export function beepSuccess(): void {
  tone(660, 90);
  tone(990, 120, 90);
}

/** Attention chime — new kitchen ticket. */
export function beepNewOrder(): void {
  tone(740, 120);
  tone(740, 120, 180);
}

/** Low buzz — error/blocked action. */
export function beepError(): void {
  tone(220, 180, 0, 0.1);
}
