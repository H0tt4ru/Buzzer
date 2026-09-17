'use client';

import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import type { ConnectionState } from '@/types/game';

/**
 * Small by default and loud only when it matters: a student needs to know at a
 * glance that their device is in sync, but a permanent warning banner would
 * just become wallpaper.
 */
export function ConnectionIndicator({
  state,
  className,
  compact = false,
}: {
  state: ConnectionState;
  className?: string;
  compact?: boolean;
}) {
  const label = t.connection[state];
  const live = state === 'connected';
  const busy = state === 'connecting' || state === 'reconnecting';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1',
        live && 'bg-lime/15 text-lime ring-lime/40',
        busy && 'bg-lemon/15 text-lemon ring-lemon/40',
        state === 'offline' && 'bg-destructive/20 text-destructive ring-destructive/50',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {live ? (
        <Wifi className="size-3.5" />
      ) : busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <WifiOff className="size-3.5" />
      )}
      {compact ? null : label}
    </span>
  );
}

/** The prominent-but-not-blocking warning for a stale client. */
export function StaleBanner({ visible, message }: { visible: boolean; message: string }) {
  if (!visible) return null;

  return (
    <div
      role="alert"
      className="animate-rise-in mx-auto w-full max-w-md rounded-md border-2 border-lemon/50 bg-lemon/15 px-4 py-2.5 text-center text-sm font-semibold text-lemon"
    >
      {message}
    </div>
  );
}
