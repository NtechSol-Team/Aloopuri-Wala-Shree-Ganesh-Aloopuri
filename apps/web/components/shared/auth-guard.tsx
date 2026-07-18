'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

/**
 * Client-side route protection. Tokens live in localStorage (Zustand persist),
 * so the gate runs on the client: wait for hydration, then bounce unauthenticated
 * users to /login. Cashiers are further confined to the POS terminal — the
 * admin dashboard/sidebar has nothing for them (no nav items, no permissions),
 * so any stray navigation there (bookmark, back-button) bounces to /pos too.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.accessToken);
  const role = useAuthStore((s) => s.user?.role);

  useEffect(() => {
    if (!hydrated) return;
    if (!token) { router.replace('/login'); return; }
    if (role === 'CASHIER' && !pathname.startsWith('/pos')) router.replace('/pos');
  }, [hydrated, token, role, pathname, router]);

  const redirectingCashier = role === 'CASHIER' && !pathname.startsWith('/pos');
  if (!hydrated || !token || redirectingCashier) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  return <>{children}</>;
}
