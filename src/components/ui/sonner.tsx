'use client';

import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      toastOptions={{
        classNames: {
          toast:
            'group rounded-lg border border-white/15 bg-stage-800 text-cream shadow-2xl font-ui text-sm',
          description: 'text-muted-foreground',
          actionButton: 'bg-lemon text-stage-900 font-semibold',
        },
      }}
    />
  );
}
