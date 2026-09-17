'use client';

import { useMemo } from 'react';
import { PartyPopper, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Confetti } from '@/components/shared/Confetti';
import { Podium } from '@/components/shared/Podium';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import type { LeaderboardRow } from '@/types/game';

/**
 * End-of-game screen: animated podium first, then the full table so nobody is
 * left off. The podium only shows ranks 1–3; ties share a rank, which is why
 * the table is the authoritative list.
 */
export function FinalResults({
  board,
  onClear,
  busy = false,
}: {
  board: LeaderboardRow[];
  onClear?: () => void;
  busy?: boolean;
}) {
  const champion = useMemo(() => board.find((row) => row.rank === 1) ?? null, [board]);

  return (
    <div className="flex flex-col gap-8">
      <Confetti trigger={champion ? `final:${champion.id}` : 'final'} count={220} durationMs={4200} />

      <header className="flex flex-col items-center gap-2 text-center">
        <PartyPopper className="size-8 text-lemon" />
        <h2 className="animate-slam-in font-display text-4xl font-extrabold text-lemon drop-shadow-[0_0_2rem_hsl(var(--lemon)/0.45)] sm:text-6xl">
          {t.admin.finalResults}
        </h2>
        <p className="text-sm text-muted-foreground">{t.admin.finalResultsBody}</p>
      </header>

      <Podium board={board} />

      <div className="panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">{t.admin.rank}</TableHead>
              <TableHead>{t.admin.name}</TableHead>
              <TableHead className="w-20 text-right">{t.admin.score}</TableHead>
              <TableHead className="w-20 text-right">{t.admin.wins}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {board.map((row) => (
              <TableRow key={row.id} className={cn(row.rank === 1 && 'bg-lemon/10')}>
                <TableCell className="font-bold tabular-nums text-muted-foreground">
                  {row.rank}
                </TableCell>
                <TableCell className="font-semibold">{row.name}</TableCell>
                <TableCell className="text-right font-display text-lg font-bold tabular-nums text-lemon">
                  {row.score}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {row.wins}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {onClear ? (
        <div className="flex justify-center">
          <Button variant="destructive" onClick={onClear} disabled={busy}>
            <Trash2 />
            {t.admin.clearGame}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
