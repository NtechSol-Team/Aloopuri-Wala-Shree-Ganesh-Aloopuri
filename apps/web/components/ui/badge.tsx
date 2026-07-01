import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
  {
    variants: {
      variant: {
        neutral: 'bg-muted text-muted-foreground',
        success: 'bg-success/12 text-success',
        warning: 'bg-warning/12 text-warning',
        danger: 'bg-danger/12 text-danger',
        info: 'bg-primary/10 text-primary',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/** Map domain statuses to badge variants + labels. */
export function statusBadgeVariant(status: string): BadgeProps['variant'] {
  switch (status) {
    case 'PAID':
    case 'DELIVERED':
    case 'RECEIVED':
    case 'COMPLETED':
    case 'CONFIRMED':
      return 'success';
    case 'PARTIALLY_PAID':
    case 'DISPATCHED':
    case 'PENDING':
      return 'warning';
    case 'UNPAID':
    case 'CANCELLED':
    case 'VOID':
      return 'danger';
    case 'DRAFT':
    case 'HELD':
      return 'neutral';
    default:
      return 'info';
  }
}
