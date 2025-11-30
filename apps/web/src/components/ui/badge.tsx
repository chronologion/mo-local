import * as React from 'react';
import { cn } from '../../lib/utils';

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'default' | 'muted' | 'accent';
};

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone = 'default', ...props }, ref) => {
    const toneClass =
      tone === 'accent'
        ? 'bg-accent/20 text-accent2 border-accent/40'
        : tone === 'muted'
          ? 'bg-white/5 text-slate-300 border-white/10'
          : 'bg-white/10 text-white border-white/20';
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide',
          toneClass,
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';
