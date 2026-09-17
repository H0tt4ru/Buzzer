import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold',
  {
    variants: {
      variant: {
        default: 'bg-primary/20 text-primary-foreground ring-1 ring-primary/40',
        live: 'bg-lime/20 text-lime ring-1 ring-lime/50',
        warn: 'bg-lemon/20 text-lemon ring-1 ring-lemon/50',
        cool: 'bg-cyan/20 text-cyan ring-1 ring-cyan/50',
        muted: 'bg-white/5 text-muted-foreground ring-1 ring-white/10',
        danger: 'bg-destructive/20 text-destructive ring-1 ring-destructive/50',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
