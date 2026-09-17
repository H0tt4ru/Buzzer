'use client';

import { Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import type { LeaderboardRow } from '@/types/game';

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

/**
 * Live standings. `enabled` mirrors the live_leaderboard setting: when the
 * teacher turns it off the panel says so rather than silently emptying, so it
 * is obvious that the data exists but is hidden on purpose. Whether *students*
 * can see standings is a separate setting enforced in SQL, not here.
 */
export function Leaderboard({
  board,
  enabled = true,
  highlightId = null,
  compact = false,
}: {
  board: LeaderboardRow[];
  enabled?: boolean;
  highlightId?: string | null;
  compact?: boolean;
}) {
  if (!enabled) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{t.admin.leaderboardHidden}</p>;
  }

  const scored = board.filter((row) => row.score > 0 || row.wins > 0);

  if (scored.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground text-balance">
        {t.admin.leaderboardEmpty}
      </p>
    );
  }

  const rows = compact ? scored.slice(0, 6) : scored;

  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <li
          key={row.id}
          className={cn(
            'flex items-center gap-3 rounded-md px-3 py-2 transition-colors',
            row.rank === 1 ? 'bg-lemon/15 ring-1 ring-lemon/40' : 'bg-white/5',
            row.id === highlightId && 'ring-2 ring-magenta/60',
          )}
        >
          <span className="w-7 shrink-0 text-center text-lg leading-none">
            {MEDAL[row.rank] ?? (
              <span className="text-sm font-bold tabular-nums text-muted-foreground">{row.rank}</span>
            )}
          </span>

          <span className="min-w-0 flex-1 truncate font-semibold">{row.name}</span>

          {row.rank === 1 ? <Crown className="size-4 shrink-0 text-lemon" /> : null}

          <span
            key={`${row.id}:${row.score}`}
            className="animate-score-bump shrink-0 font-display text-lg font-bold tabular-nums text-lemon"
          >
            {row.score}
          </span>
          <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
            {row.wins}× {t.admin.wins.toLowerCase()}
          </span>
        </li>
      ))}
    </ol>
  );
}
