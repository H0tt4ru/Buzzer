'use client';

import { useState } from 'react';
import {
  BellOff,
  BellRing,
  Flag,
  Pause,
  Play,
  PlusCircle,
  RotateCcw,
  Trash2,
  Trophy,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { t } from '@/lib/i18n';
import type { ActionResult } from '@/hooks/useAdminGame';
import type { AdminAction, AdminSnapshot, GamePhase } from '@/types/game';

/**
 * The teacher's hands. Two rules shape this panel:
 *
 *  - Only offer what the current phase allows. A button that exists but errors
 *    is worse than no button when a class of 30 is waiting.
 *  - Keep the wrong-answer fork explicit. "Undo" and "reopen" both follow a
 *    winner but mean different things — undo erases the win (a mis-press, a
 *    technical glitch), reopen keeps it in the history and passes the turn to
 *    the rest of the class. Collapsing them into one button loses the
 *    distinction the history depends on, so they are separate, labelled, and
 *    confirmed.
 */
export function GameControls({
  snapshot,
  phase,
  busy,
  onRun,
}: {
  snapshot: AdminSnapshot;
  phase: GamePhase;
  busy: AdminAction | null;
  onRun: (action: AdminAction, payload?: Record<string, unknown>) => Promise<ActionResult>;
}) {
  const [confirm, setConfirm] = useState<'end' | 'clear' | 'undo' | 'reopen' | null>(null);

  const { game, round, students } = snapshot;
  const working = busy !== null;
  const ended = game.status === 'ended';
  const paused = game.status === 'paused';

  const hasWinner = round?.winner_student_id != null;
  const winnerName =
    students.find((student) => student.id === round?.winner_student_id)?.name ?? t.admin.noWinnerYet;

  const manualAward = game.settings.award_mode === 'manual';
  const canAward = hasWinner && manualAward && !(round?.points_awarded ?? false);

  if (ended) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" onClick={() => setConfirm('clear')} disabled={working}>
          <Trash2 />
          {t.admin.clearGame}
        </Button>
        <Dialogs confirm={confirm} setConfirm={setConfirm} winnerName={winnerName} onRun={onRun} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Primary row: the two buttons the teacher presses all lesson. */}
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Button
          size="xl"
          variant="accent"
          disabled={working || paused}
          onClick={() => void onRun('next_round')}
        >
          <PlusCircle />
          {game.current_round_number === 0 ? t.admin.startFirstRound : t.admin.nextRound}
        </Button>

        {phase === 'BUZZER_ACTIVE' || phase === 'COUNTDOWN' ? (
          <Button
            size="xl"
            variant="outline"
            disabled={working}
            onClick={() => void onRun('disable_buzzer')}
          >
            <BellOff />
            {t.admin.disableBuzzer}
          </Button>
        ) : (
          <Button
            size="xl"
            disabled={working || paused || round === null || hasWinner}
            onClick={() => void onRun('enable_buzzer')}
          >
            <BellRing />
            {t.admin.enableBuzzer}
          </Button>
        )}
      </div>

      {/* The wrong-answer fork, only once somebody holds the round. */}
      {hasWinner ? (
        <div className="animate-rise-in flex flex-col gap-2.5 rounded-md bg-lemon/10 p-3 ring-1 ring-lemon/30">
          <div>
            <p className="font-display text-base font-bold text-lemon">{t.admin.wrongAnswerTitle}</p>
            <p className="text-xs text-muted-foreground text-balance">{t.admin.wrongAnswerBody}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canAward ? (
              <Button variant="lemon" disabled={working} onClick={() => void onRun('award_point')}>
                <Trophy />
                {t.admin.awardPoint}
              </Button>
            ) : null}

            <Button
              variant="outline"
              disabled={working}
              onClick={() => void onRun('next_round')}
            >
              <Flag />
              {t.admin.endRound}
            </Button>

            <Button variant="outline" disabled={working} onClick={() => setConfirm('reopen')}>
              <RotateCcw />
              {t.admin.reopenBuzzer}
            </Button>

            <Button variant="ghost" disabled={working} onClick={() => setConfirm('undo')}>
              <Undo2 />
              {t.admin.undoWinner}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Lifecycle. */}
      <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
        {paused ? (
          <Button variant="lemon" disabled={working} onClick={() => void onRun('resume_game')}>
            <Play />
            {t.admin.resume}
          </Button>
        ) : (
          <Button variant="outline" disabled={working} onClick={() => void onRun('pause_game')}>
            <Pause />
            {t.admin.pause}
          </Button>
        )}

        <Button variant="outline" disabled={working} onClick={() => setConfirm('end')}>
          <Flag />
          {t.admin.endGame}
        </Button>

        <Button variant="ghost" disabled={working} onClick={() => setConfirm('clear')}>
          <Trash2 />
          {t.admin.clearGame}
        </Button>
      </div>

      <Dialogs confirm={confirm} setConfirm={setConfirm} winnerName={winnerName} onRun={onRun} />
    </div>
  );
}

function Dialogs({
  confirm,
  setConfirm,
  winnerName,
  onRun,
}: {
  confirm: 'end' | 'clear' | 'undo' | 'reopen' | null;
  setConfirm: (value: 'end' | 'clear' | 'undo' | 'reopen' | null) => void;
  winnerName: string;
  onRun: (action: AdminAction, payload?: Record<string, unknown>) => Promise<ActionResult>;
}) {
  return (
    <>
      <ConfirmDialog
        open={confirm === 'end'}
        onOpenChange={(open) => setConfirm(open ? 'end' : null)}
        title={t.admin.confirmEndGameTitle}
        description={t.admin.confirmEndGameBody}
        confirmLabel={t.admin.endGame}
        onConfirm={() => void onRun('end_game')}
      />

      <ConfirmDialog
        open={confirm === 'clear'}
        onOpenChange={(open) => setConfirm(open ? 'clear' : null)}
        title={t.admin.confirmClearTitle}
        description={t.admin.confirmClearBody}
        confirmLabel={t.admin.clearGame}
        requireAcknowledge={t.admin.confirmClearAck}
        onConfirm={() => void onRun('clear_game')}
      />

      <ConfirmDialog
        open={confirm === 'undo'}
        onOpenChange={(open) => setConfirm(open ? 'undo' : null)}
        title={t.admin.confirmUndoTitle}
        description={t.admin.confirmUndoBody(winnerName)}
        confirmLabel={t.admin.undoWinner}
        confirmVariant="lemon"
        onConfirm={() => void onRun('undo_winner')}
      />

      <ConfirmDialog
        open={confirm === 'reopen'}
        onOpenChange={(open) => setConfirm(open ? 'reopen' : null)}
        title={t.admin.confirmReopenTitle}
        description={t.admin.confirmReopenBody(winnerName)}
        confirmLabel={t.admin.reopenBuzzer}
        confirmVariant="accent"
        onConfirm={() => void onRun('reopen_buzzer')}
      />
    </>
  );
}
