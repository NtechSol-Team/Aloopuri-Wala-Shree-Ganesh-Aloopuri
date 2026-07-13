import { AuthGuard } from '@/components/shared/auth-guard';

/** Hidden developer console — not linked from any menu, reached by direct URL + passphrase. */
export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-950 text-slate-100">{children}</div>
    </AuthGuard>
  );
}
