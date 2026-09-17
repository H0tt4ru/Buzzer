'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { describeEvent, eventTone, type EventTone } from '@/lib/game/events';
import { cn, formatClock } from '@/lib/utils';
import { t } from '@/lib/i18n';
import type { GameEvent } from '@/types/game';

const PAGE = 40;

const DOT: Record<EventTone, string> = {
  neutral: 'bg-white/25',
  good: 'bg-lime',
  warn: 'bg-lemon',
  bad: 'bg-destructive',
};

/**
 * The history is append-only in Postgres: a correction (an undone winner, a
 * reopened buzzer) arrives as a *new* row rather than an edit, so this list
 * only ever grows and can be read top-to-bottom as what actually happened.
 * Timestamps are the server's, not the viewer's.
 */
export function EventHistoryPanel({ events }: { events: GameEvent[] }) {
  const [limit, setLimit] = useState(PAGE);

  // The RPC already returns newest-first; sort defensively so the panel does
  // not depend on that.
  const ordered = useMemo(() => [...events].sort((a, b) => b.id - a.id), [events]);

  if (ordered.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t.admin.historyEmpty}</p>;
  }

  const visible = ordered.slice(0, limit);

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex max-h-[26rem] flex-col gap-0.5 overflow-y-auto pr-1">
        {visible.map((event) => (
          <li key={event.id} className="flex items-start gap-3 rounded-sm px-2 py-1.5 hover:bg-white/5">
            <span className="shrink-0 pt-0.5 font-mono text-[0.7rem] tabular-nums text-muted-foreground">
              {formatClock(event.created_at)}
            </span>
            <span
              aria-hidden
              className={cn('mt-1.5 size-2 shrink-0 rounded-full', DOT[eventTone(event)])}
            />
            <span className="min-w-0 flex-1 text-sm leading-snug">{describeEvent(event)}</span>
          </li>
        ))}
      </ol>

      {ordered.length > visible.length ? (
        <Button variant="outline" size="sm" onClick={() => setLimit((n) => n + PAGE)}>
          {`Tampilkan ${Math.min(PAGE, ordered.length - visible.length)} kejadian lagi`}
        </Button>
      ) : null}
    </div>
  );
}
