import { AuthGuard } from '@/components/shared/auth-guard';

/**
 * Full-screen POS shell — no sidebar/header, larger touch targets.
 *
 * Height is `100dvh` (dynamic viewport height), not `100vh`. On tablets and in the
 * Android WebView, `100vh` is the *largest* possible viewport and ignores the
 * browser's address/status bars, so the shell ran taller than the visible screen
 * and pushed the cart's Charge button below the fold — the cashier had to scroll
 * to reach it. `100dvh` tracks the actually-visible height, keeping the footer
 * pinned on every screen size. `h-screen` stays as a fallback for the rare engine
 * without dvh support.
 */
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="h-screen supports-[height:100dvh]:h-[100dvh] w-screen overflow-hidden bg-surface text-[15px]">{children}</div>
    </AuthGuard>
  );
}
