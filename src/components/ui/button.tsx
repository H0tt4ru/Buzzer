import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold transition-all disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:translate-y-px no-select',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:brightness-110',
        accent: 'bg-cyan text-stage-900 shadow-lg shadow-cyan/25 hover:brightness-110',
        lemon: 'bg-lemon text-stage-900 shadow-lg shadow-lemon/25 hover:brightness-105',
        destructive: 'bg-destructive text-destructive-foreground shadow-lg shadow-destructive/20 hover:brightness-110',
        outline: 'border-2 border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-stage-600',
        ghost: 'hover:bg-white/10',
        link: 'text-cyan underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 px-5 text-sm',
        sm: 'h-9 rounded-sm px-3 text-xs',
        lg: 'h-14 rounded-lg px-7 text-base',
        xl: 'h-20 rounded-lg px-8 text-xl font-display',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
