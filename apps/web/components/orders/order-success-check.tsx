'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

/**
 * The green circle-and-tick pop familiar from UPI apps (PhonePe/Paytm) after a
 * payment goes through — reused here for "your order has been placed". Pure CSS/SVG,
 * no animation library: the circle pops in (see `pop-in` in tailwind.config.ts),
 * then the check stroke draws itself using the `pathLength` trick (dash length is
 * always 100 regardless of actual path geometry, so the keyframe never needs tuning).
 */
function SuccessTick() {
  return (
    <svg viewBox="0 0 52 52" className="h-20 w-20 animate-pop-in">
      <circle cx="26" cy="26" r="25" className="fill-success" />
      <path
        d="M14 27l7 7 17-17"
        fill="none"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={100}
        strokeDasharray={100}
        strokeDashoffset={100}
        className="animate-check-draw"
      />
    </svg>
  );
}

/**
 * Drop-in replacement for a dialog's body: shows the tick, a headline, and whatever
 * summary the caller passes, then calls `onDone` either after `autoAdvanceMs` or when
 * the outlet taps Continue — whichever comes first. Doesn't render its own overlay/
 * backdrop, so it's meant to sit inside an already-open Dialog/DialogContent.
 */
export function OrderSuccessScreen({
  title, summary, continueLabel = 'Continue', autoAdvanceMs = 1800, onDone,
}: {
  title: string;
  summary?: React.ReactNode;
  continueLabel?: string;
  autoAdvanceMs?: number;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, autoAdvanceMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <SuccessTick />
      <p className="text-card-title font-semibold">{title}</p>
      {summary && <div className="text-body text-muted-foreground">{summary}</div>}
      <Button variant="secondary" size="sm" className="mt-2" onClick={onDone}>{continueLabel}</Button>
    </div>
  );
}
