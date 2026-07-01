import { AuthGuard } from '@/components/shared/auth-guard';

/** Full-screen POS shell — no sidebar/header, larger touch targets. */
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="h-screen w-screen overflow-hidden bg-surface text-[15px]">{children}</div>
    </AuthGuard>
  );
}
