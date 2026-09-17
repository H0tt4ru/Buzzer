'use client';

import { cn } from '@/lib/utils';
import { podiumOrder } from '@/lib/game/scoring';
import { t } from '@/lib/i18n';
import type { LeaderboardRow } from '@/types/game';

const MEDALS = ['🥈', '🥇', '🥉'];
/* Visual order: 2nd left, 1st raised in the centre, 3rd right. */
const HEIGHTS = ['h-28 sm:h-36', 'h-44 sm:h-56', 'h-20 sm:h-28'];
const TINTS = [
  'from-slate-300/90 to-slate-400/60',
  'from-lemon to-amber-500/80',
  'from-orange-300/80 to-orange-500/50',
];
/* Staggered so the champion's plinth lands last. */
const DELAYS = ['150ms', '420ms', '0ms'];

export function Podium({ board }: { board: LeaderboardRow[] }) {
  const slots = podiumOrder(board);
  if (slots.every((slot) => slot === null)) return null;

  return (
    <div className="flex items-end justify-center gap-2 sm:gap-5">
      {slots.map((row, index) => (
        <div key={index} className="flex w-1/3 max-w-[11rem] flex-col items-center gap-2">
          {row ? (
            <>
              <div
                className="animate-pop-in text-4xl sm:text-5xl"
                style={{ animationDelay: DELAYS[index] }}
              >
                {MEDALS[index]}
              </div>
              <p className="font-display text-base font-bold leading-tight text-balance sm:text-xl">
                {row.name}
              </p>
              <p className="text-sm font-bold text-lemon tabular-nums">
                {t.student.yourScore(row.score)}
              </p>
              <div
                className={cn(
                  'animate-rise-in w-full rounded-t-lg bg-gradient-to-b',
                  HEIGHTS[index],
                  TINTS[index],
                )}
                style={{ animationDelay: DELAYS[index] }}
              />
            </>
          ) : (
            <div className={cn('w-full rounded-t-lg bg-white/5', HEIGHTS[index])} />
          )}
        </div>
      ))}
    </div>
  );
}
