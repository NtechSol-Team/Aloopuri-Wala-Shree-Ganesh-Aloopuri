'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, Store, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { navForRole, POS_HREF } from './nav-config';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  if (!user) return null;

  const items = navForRole(user.role);
  const canUsePos = user.role === 'SUPER_ADMIN' || user.role === 'FRANCHISE_OWNER' || user.role === 'CASHIER';

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-screen flex-col border-r border-border bg-card transition-all',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="flex h-16 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Store className="h-4 w-4" />
        </div>
        {!collapsed && <span className="truncate font-semibold">Surat Food</span>}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2 scrollbar-thin">
        {items.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-body font-medium transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-surface',
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}

        {canUsePos && (
          <Link
            href={POS_HREF}
            className={cn(
              'mt-2 flex items-center gap-3 rounded-md border border-primary/30 bg-accent px-3 py-2 text-body font-semibold text-primary hover:bg-primary/10',
            )}
            title={collapsed ? 'POS' : undefined}
          >
            <Monitor className="h-5 w-5 shrink-0" />
            {!collapsed && <span>Open POS</span>}
          </Link>
        )}
      </nav>

      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex h-12 items-center justify-center border-t border-border text-muted-foreground hover:bg-surface"
      >
        <ChevronLeft className={cn('h-5 w-5 transition-transform', collapsed && 'rotate-180')} />
      </button>
    </aside>
  );
}
