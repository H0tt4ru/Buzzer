'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Pause, Trophy, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BuzzerButton } from '@/components/student/BuzzerButton';
import { Confetti } from '@/components/shared/Confetti';
import { ConnectionIndicator, StaleBanner } from '@/components/shared/ConnectionIndicator';
import { Countdown } from '@/components/shared/Countdown';
import { useStudentGame } from '@/hooks/useStudentGame';
import { unlockAudio } from '@/lib/sound';
import { buzzErrorMessage, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * The student's whole screen. One job: make the current state unmistakable and
 * the buzzer impossible to miss. Everything else — name, connection, score —
 * is chrome at the edges.
 */
export function StudentGame({ token }: { token: string }) {
  const game = useStudentGame(token);
  const [toast, setToast] = useState<string | null>(null);
  const { lastFeedback: feedback, clearFeedback } = game;

  // Audio cannot start until the student has touched the page. Any first
  // interaction unlocks it, so the buzzer is never silent by the time it
  // matters.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!feedback) return;
    setToast(feedback === 'network' ? t.errors.network : buzzErrorMessage(feedback));
    const timer = window.setTimeout(() => {
      setToast(null);
      clearFeedback();
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [feedback, clearFeedback]);

  const myRank = useMemo(() => {
    if (!game.leaderboard || !game.state) return null;
    return game.leaderboard.find((row) => row.id === game.state?.student.id) ?? null;
  }, [game.leaderboard, game.state]);

  /* --------------------------------------------------------------------- */
  /* Loading / invalid link                                               */
  /* --------------------------------------------------------------------- */

  if (game.error === 'invalid_token') {
    return (
      <Shell>
        <div className="panel mx-auto max-w-sm p-8 text-center">
          <p className="font-display text-2xl font-bold">{t.errors.invalidLink}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            {t.errors.invalidLinkBody}
          </p>
        </div>
      </Shell>
    );
  }

  if (game.loading || !game.state) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 text-center">
          <Loader2 className="size-10 animate-spin text-lemon" />
          <p className="font-display text-lg text-muted-foreground">{t.connection.syncing}</p>
        </div>
      </Shell>
    );
  }

  const { state, phase } = game;

  /* --------------------------------------------------------------------- */
  /* Main screen                                                          */
  /* --------------------------------------------------------------------- */

  return (
    <Shell>
      <Confetti trigger={game.isWinner ? `${state.round?.id}:${state.round?.buzz_window}` : null} />

      {/* Top chrome: who you are, whether you are in sync, sound. */}
      <header className="flex w-full items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold sm:text-xl">
            {t.student.greeting(state.student.name)}
          </p>
          {state.round ? (
            <p className="text-xs font-semibold text-muted-foreground">
              {t.student.round(state.round.number)}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {myRank ? (
            <Badge variant="warn" className="tabular-nums">
              <Trophy className="size-3" />
              {t.student.yourScore(myRank.score)}
            </Badge>
          ) : null}
          <ConnectionIndicator state={game.connection} compact />
          <button
            type="button"
            onClick={game.toggleSound}
            aria-label={game.soundOn ? t.common.soundOn : t.common.soundOff}
            className="rounded-full bg-white/5 p-2 text-muted-foreground ring-1 ring-white/10"
          >
            {game.soundOn ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
        </div>
      </header>

      {/* The stage. */}
      <main className="flex w-full flex-1 flex-col items-center justify-center gap-6 py-4">
        {phase === 'GAME_OVER' ? (
          <FinalCard
            name={state.student.name}
            rank={myRank?.rank ?? null}
            score={myRank?.score ?? null}
          />
        ) : phase === 'PAUSED' ? (
          <StatusCard
            icon={<Pause className="size-10 text-lemon" />}
            title={t.student.paused}
            body={t.student.pausedBody}
          />
        ) : phase === 'COUNTDOWN' ? (
          <Countdown seconds={game.countdown} roundNumber={state.round?.number ?? 1} />
        ) : (
          <>
            <StatusLine
              phase={phase}
              outcome={game.outcome}
              isWinner={game.isWinner}
              winnerName={game.winnerName}
              excluded={state.round?.excluded ?? false}
            />
            <BuzzerButton
              phase={phase}
              outcome={game.outcome}
              buzzable={game.buzzable}
              blockReason={game.blockReason}
              isWinner={game.isWinner}
              onBuzz={game.buzz}
            />
            {phase === 'WAITING' || phase === 'READY_CHECK' ? (
              <ReadyControl
                isReady={state.student.is_ready}
                onChange={game.setReady}
                connected={game.connection === 'connected'}
              />
            ) : null}
          </>
        )}

        <StaleBanner
          visible={game.blockReason === 'stale' || game.blockReason === 'offline'}
          message={
            game.connection === 'connected'
              ? t.connection.staleWarning
              : t.connection.waitingForConnection
          }
        />

        {toast ? (
          <p className="animate-rise-in rounded-md bg-white/10 px-4 py-2 text-sm font-semibold">
            {toast}
          </p>
        ) : null}
      </main>

      {/* Standings, only if the teacher allows it. */}
      {game.leaderboard && game.leaderboard.length > 0 ? (
        <footer className="w-full">
          <p className="mb-2 text-xs font-bold text-muted-foreground">{t.student.standings}</p>
          <ol className="flex flex-col gap-1">
            {game.leaderboard.slice(0, 5).map((row) => (
              <li
                key={row.id}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-md px-3 py-1.5 text-sm',
                  row.id === state.student.id ? 'bg-lemon/15 font-bold text-lemon' : 'bg-white/5',
                )}
              >
                <span className="truncate">
                  <span className="mr-2 tabular-nums opacity-60">{row.rank}.</span>
                  {row.name}
                </span>
                <span className="shrink-0 tabular-nums">{row.score}</span>
              </li>
            ))}
          </ol>
        </footer>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {t.phase[phase]}
      </span>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="stage-backdrop flex min-h-[100dvh] flex-col items-center gap-3 px-4 py-4 sm:px-6">
      <div className="flex w-full max-w-xl flex-1 flex-col items-center gap-3">{children}</div>
    </div>
  );
}

function StatusLine({
  phase,
  outcome,
  isWinner,
  winnerName,
  excluded,
}: {
  phase: string;
  outcome: string;
  isWinner: boolean;
  winnerName: string | null;
  excluded: boolean;
}) {
  if (phase === 'ROUND_COMPLETE') {
    return (
      <div className="animate-rise-in text-center">
        <p className="font-display text-2xl font-bold sm:text-3xl">
          {isWinner ? t.student.youWon : t.student.roundOver}
        </p>
        <p className="mt-1.5 text-sm text-muted-foreground text-balance">
          {isWinner
            ? t.student.youWonBody
            : winnerName
              ? t.student.someoneElseWon(winnerName)
              : t.student.roundOverNoWinner}
        </p>
      </div>
    );
  }

  if (outcome === 'buzzed') {
    return (
      <div className="animate-pop-in text-center">
        <p className="font-display text-2xl font-bold text-cyan">{t.student.buzzed}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t.student.buzzedBody}</p>
      </div>
    );
  }

  if (excluded) {
    return (
      <p className="max-w-xs text-center text-sm font-semibold text-lemon text-balance">
        {t.student.excluded}
      </p>
    );
  }

  if (phase === 'BUZZER_ACTIVE') {
    return (
      <p className="animate-pop-in font-display text-xl font-bold text-lime">
        {t.phase.BUZZER_ACTIVE}
      </p>
    );
  }

  return (
    <div className="text-center">
      <p className="font-display text-xl font-bold sm:text-2xl">{t.student.waitingTitle}</p>
      <p className="mt-1 text-sm text-muted-foreground text-balance">{t.student.waitingBody}</p>
    </div>
  );
}

function ReadyControl({
  isReady,
  onChange,
  connected,
}: {
  isReady: boolean;
  onChange: (ready: boolean) => void;
  connected: boolean;
}) {
  if (isReady) {
    return (
      <div className="animate-pop-in flex flex-col items-center gap-1.5">
        <p className="flex items-center gap-2 font-display text-lg font-bold text-lime">
          <CheckCircle2 className="size-5" />
          {t.student.readyConfirmed}
        </p>
        <p className="text-xs text-muted-foreground">{t.student.readyWaiting}</p>
        <Button variant="ghost" size="sm" onClick={() => onChange(false)}>
          {t.student.cancelReady}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="font-display text-base font-bold">{t.student.readyQuestion}</p>
      <Button
        variant="accent"
        size="lg"
        disabled={!connected}
        onClick={() => onChange(true)}
        className="px-10"
      >
        {t.student.readyButton}
      </Button>
    </div>
  );
}

function StatusCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="panel animate-pop-in flex max-w-sm flex-col items-center gap-3 p-8 text-center">
      {icon}
      <p className="font-display text-2xl font-bold">{title}</p>
      <p className="text-sm leading-relaxed text-muted-foreground text-balance">{body}</p>
    </div>
  );
}

function FinalCard({
  name,
  rank,
  score,
}: {
  name: string;
  rank: number | null;
  score: number | null;
}) {
  return (
    <div className="panel animate-slam-in flex max-w-sm flex-col items-center gap-3 p-8 text-center">
      <p className="font-display text-4xl font-extrabold text-lemon">{t.student.gameOver}</p>
      <p className="font-display text-xl font-bold">{name}</p>
      {rank !== null && score !== null ? (
        <p className="text-sm font-semibold text-muted-foreground">
          {t.student.yourRank(rank)} · {t.student.yourScore(score)}
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">{t.student.gameOverBody}</p>
    </div>
  );
}
