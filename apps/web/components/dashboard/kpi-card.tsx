import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  changePct?: number;
  href?: string;
  accent?: 'primary' | 'success' | 'warning' | 'danger';
}

const accentBg: Record<NonNullable<KpiCardProps['accent']>, string> = {
  primary: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
};

export function KpiCard({ label, value, icon: Icon, changePct, href, accent = 'primary' }: KpiCardProps) {
  // The 32px kpi size only has room for a handful of characters before it runs
  // into the icon badge — a longer formatted amount (₹6,73,175 and up) would
  // spill past the card's edge at that size instead of wrapping, since a
  // comma-separated number has nowhere natural to break. Step the size down
  // for longer values, and keep break-words as a fallback for whatever's left.
  const valueSizeClass = value.length >= 8 ? 'text-card-title' : 'text-kpi';

  const body = (
    <Card className={cn('p-5 transition-shadow', href && 'cursor-pointer hover:shadow-md')}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn('mt-2 break-words font-bold leading-tight', valueSizeClass)}>{value}</p>
          {changePct !== undefined && (
            <div
              className={cn(
                'mt-2 inline-flex items-center gap-1 text-caption font-semibold',
                changePct >= 0 ? 'text-success' : 'text-danger',
              )}
            >
              {changePct >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              {Math.abs(changePct)}% vs last month
            </div>
          )}
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', accentBg[accent])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}
