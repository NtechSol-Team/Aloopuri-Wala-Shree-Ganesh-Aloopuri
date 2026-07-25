'use client';

/**
 * Tiny synthesized UI sounds via WebAudio — no audio assets needed.
 * Safe to call anywhere; silently no-ops if the AudioContext is unavailable
 * (e.g. before any user gesture on iOS).
 *
 * Two guarantees matter on shop hardware:
 *  1. Sound must never delay the UI. A till PC with a flaky/absent audio
 *     device can stall for whole seconds inside AudioContext calls, so every
 *     beep is deferred off the tap's critical path — the cart updates first,
 *     the sound follows.
 *  2. A failed AudioContext stays failed. Retrying the (blocking) constructor
 *     on every tap turned each add-to-cart into a driver stall on speakerless
 *     tills; one failure now disables sound for the session.
 */

let ctx: AudioContext | null = null;
let audioBroken = false;

function audioCtx(): AudioContext | null {
  if (audioBroken || typeof window === 'undefined') return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch {
    audioBroken = true;
    return null;
  }
}

function tone(freq: number, durationMs: number, startMs = 0, volume = 0.08): void {
  // setTimeout(0) pushes the audio work behind the pending React render/paint,
  // so even a slow audio stack can't make the tap feel late.
  setTimeout(() => {
    try {
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
    } catch {
      audioBroken = true; // a context that dies mid-use stays off too
    }
  }, 0);
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
