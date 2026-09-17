'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { History, Link2, ListOrdered, Loader2, Settings, SlidersHorizontal, Users, Volume2, VolumeX } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConnectionIndicator } from '@/components/shared/ConnectionIndicator';
import { Confetti } from '@/components/shared/Confetti';
import { Countdown } from '@/components/shared/Countdown';
import { EventHistoryPanel } from '@/components/admin/EventHistoryPanel';
import { FinalResults } from '@/components/admin/FinalResults';
import { GameControls } from '@/components/admin/GameControls';
import { Leaderboard } from '@/components/admin/Leaderboard';
import { SettingsPanel } from '@/components/admin/SettingsPanel';
import { StudentLinksPanel } from '@/components/admin/StudentLinksPanel';
import { StudentRoster } from '@/components/admin/StudentRoster';
import { useAdminGame } from '@/hooks/useAdminGame';
import { forgetGame } from '@/lib/admin-session';
import { adminErrorMessage, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { AdminAction, GameSettings } from '@/types/game';

const PHASE_TONE: Record<string, string> = {
  WAITING: 'text-muted-foreground',
  READY_CHECK: 'text-cyan',
  COUNTDOWN: 'text-lemon',
  BUZZER_ACTIVE: 'text-lime',
  ROUND_COMPLETE: 'text-lemon',
  PAUSED: 'text-lemon',
  GAME_OVER: 'text-magenta',
};

export function AdminDashboard({ gameId, adminToken }: { gameId: string; adminToken: string | null }) {
  const router = useRouter();
  const game = useAdminGame(gameId, adminToken);
  const [tab, setTab] = useState('control');

  const { snapshot, run } = game;

  /**
   * One place where a failed action becomes something the teacher can read.
   * The readiness gate is the only "soft" failure — it is a legitimate answer
   * rather than a fault, so it gets a warning with the actual counts.
   */
  const dispatch = useCallback(
    async (action: AdminAction, payload: Record<string, unknown> = {}) => {
      const result = await run(action, payload);

      if (!result.ok) {
        if (result.error === 'not_all_ready') {
          toast.warning(
            t.admin.notAllReady(Number(result.data?.ready ?? 0), Number(result.data?.total ?? 0)),
          );
        } else if (result.error === 'network') {
          toast.error(t.errors.network);
        } else {
          toast.error(adminErrorMessage(result.error));
        }
        return result;
      }

      if (action === 'clear_game') {
        forgetGame(gameId);
        router.replace('/admin');
      }
      if (action === 'update_settings') toast.success(t.admin.settingsSaved);

      return result;
    },
    [run, gameId, router],
  );

  const onSettings = useCallback(
    async (patch: Partial<GameSettings>) => {
      await dispatch('update_settings', { settings: patch });
    },
    [dispatch],
  );

  const winnerName = useMemo(() => {
    if (!snapshot?.round?.winner_student_id) return null;
    return snapshot.students.find((s) => s.id === snapshot.round?.winner_student_id)?.name ?? null;
  }, [snapshot]);

  /* ---------------------------------------------------------------------- */
  /* Guard states                                                           */
  /* ---------------------------------------------------------------------- */

  if (game.unauthorized) {
    return (
      <Guard title={t.errors.gameMissing} body={t.errors.unauthorized}>
        <Button variant="outline" onClick={() => router.replace('/admin')}>
          {t.common.back}
        </Button>
      </Guard>
    );
  }

  if (game.missing) {
    return (
      <Guard title={t.errors.gameMissing} body={t.errors.gameMissingBody}>
        <Button
          variant="outline"
          onClick={() => {
            forgetGame(gameId);
            router.replace('/admin');
          }}
        >
          {t.common.back}
        </Button>
      </Guard>
    );
  }

  if (game.loading || !snapshot) {
    return (
      <Guard title={t.common.loading} body={t.connection.syncing}>
        <Loader2 className="size-8 animate-spin text-lemon" />
      </Guard>
    );
  }

  const settings = snapshot.game.settings;
  const liveBoard = settings.live_leaderboard;

  /* ---------------------------------------------------------------------- */
  /* Game over takes the whole screen                                       */
  /* ---------------------------------------------------------------------- */

  if (game.phase === 'GAME_OVER') {
    return (
      <div className="stage-backdrop min-h-[100dvh] px-4 py-8 sm:px-8">
        <div className="mx-auto w-full max-w-4xl">
          <FinalResults
            board={snapshot.leaderboard}
            busy={game.busy !== null}
            onClear={() => void dispatch('clear_game')}
          />
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* Main dashboard                                                         */
  /* ---------------------------------------------------------------------- */

  return (
    <div className="stage-backdrop min-h-[100dvh] px-3 py-4 sm:px-6 sm:py-6">
      <Confetti
        trigger={
          winnerName && snapshot.round
            ? `${snapshot.round.id}:${snapshot.round.buzz_window}`
            : null
        }
        count={90}
        durationMs={2000}
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
        {/* Header --------------------------------------------------------- */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-extrabold leading-none sm:text-3xl">
              {t.app.name}
            </h1>
            <p className="text-xs font-semibold text-muted-foreground">{t.admin.dashboardTitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="cool" className="font-mono tracking-widest">
              {t.admin.joinCode}: {snapshot.game.join_code}
            </Badge>
            <ConnectionIndicator state={game.connection} />
            <Button
              variant="ghost"
              size="icon"
              aria-label={game.soundOn ? t.common.soundOn : t.common.soundOff}
              onClick={game.toggleSound}
            >
              {game.soundOn ? <Volume2 /> : <VolumeX />}
            </Button>
          </div>
        </header>

        {/* Scoreboard strip ---------------------------------------------- */}
        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Stat label={t.admin.round} value={snapshot.game.current_round_number || '—'} />
          <Stat
            label={t.admin.status}
            value={t.phase[game.phase]}
            className={cn('text-lg sm:text-xl', PHASE_TONE[game.phase])}
          />
          <Stat
            label={t.admin.connected}
            value={`${snapshot.students.filter((s) => s.connected && game.presentIds.has(s.id)).length}/${snapshot.students.length}`}
          />
          <Stat
            label={t.admin.buzzedCount}
            value={`${snapshot.students.filter((s) => s.buzzed_this_round).length}/${snapshot.students.length}`}
          />
        </section>

        {/* The stage: countdown, or who won --------------------------------- */}
        <section className="panel flex min-h-44 flex-col items-center justify-center gap-2 p-5 text-center">
          {game.phase === 'COUNTDOWN' ? (
            <Countdown
              seconds={game.countdown}
              roundNumber={snapshot.game.current_round_number}
              showRound={false}
            />
          ) : winnerName ? (
            <>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {t.admin.winner}
              </p>
              <p className="animate-slam-in font-display text-4xl font-extrabold text-lemon drop-shadow-[0_0_2rem_hsl(var(--lemon)/0.4)] sm:text-6xl">
                {winnerName}
              </p>
              {snapshot.round?.points_awarded ? (
                <Badge variant="live">
                  {t.events.points_awarded(winnerName, snapshot.round.awarded_points)}
                </Badge>
              ) : null}
            </>
          ) : game.phase === 'BUZZER_ACTIVE' ? (
            <p className="animate-buzzer-pulse font-display text-4xl font-extrabold text-lime sm:text-5xl">
              {t.phase.BUZZER_ACTIVE}
            </p>
          ) : game.phase === 'PAUSED' ? (
            <p className="font-display text-3xl font-bold text-lemon">{t.phase.PAUSED}</p>
          ) : (
            <p className="font-display text-2xl font-bold text-muted-foreground">
              {t.phase[game.phase]}
            </p>
          )}
        </section>

        {/* Controls + live board ------------------------------------------ */}
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <Card>
            <CardContent className="pt-5">
              <GameControls
                snapshot={snapshot}
                phase={game.phase}
                busy={game.busy}
                onRun={dispatch}
              />
            </CardContent>
          </Card>

          <Card className="hidden lg:block">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListOrdered className="size-4 text-lemon" />
                {t.admin.leaderboardTitle}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Leaderboard
                board={snapshot.leaderboard}
                enabled={liveBoard}
                highlightId={snapshot.round?.winner_student_id ?? null}
                compact
              />
            </CardContent>
          </Card>
        </div>

        {/* Detail tabs ---------------------------------------------------- */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="control">
              <SlidersHorizontal className="size-4" />
              <span className="hidden sm:inline">{t.admin.tabs.students}</span>
            </TabsTrigger>
            <TabsTrigger value="links">
              <Link2 className="size-4" />
              <span className="hidden sm:inline">{t.admin.tabs.links}</span>
            </TabsTrigger>
            <TabsTrigger value="board">
              <ListOrdered className="size-4" />
              <span className="hidden sm:inline">{t.admin.tabs.leaderboard}</span>
            </TabsTrigger>
            <TabsTrigger value="history">
              <History className="size-4" />
              <span className="hidden sm:inline">{t.admin.tabs.history}</span>
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="size-4" />
              <span className="hidden sm:inline">{t.admin.tabs.settings}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="control">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4 text-cyan" />
                  {t.admin.rosterTitle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <StudentRoster
                  students={snapshot.students}
                  presentIds={game.presentIds}
                  excludedIds={snapshot.round?.excluded_student_ids ?? []}
                  winnerId={snapshot.round?.winner_student_id ?? null}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="links">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.admin.linksTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <StudentLinksPanel
                  students={snapshot.students}
                  busy={game.busy !== null}
                  onAdd={(names) => void dispatch('add_students', { names })}
                  onRename={(studentId, name) =>
                    void dispatch('rename_student', { student_id: studentId, name })
                  }
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="board">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.admin.leaderboardTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <Leaderboard
                  board={snapshot.leaderboard}
                  enabled={liveBoard}
                  highlightId={snapshot.round?.winner_student_id ?? null}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.admin.historyTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <EventHistoryPanel events={snapshot.events} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t.admin.settingsTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <SettingsPanel
                  settings={settings}
                  busy={game.busy === 'update_settings'}
                  onChange={onSettings}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string | number;
  className?: string;
}) {
  return (
    <div className="panel px-4 py-3">
      <p className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn('stat-figure mt-1 truncate', className)}>{value}</p>
    </div>
  );
}

function Guard({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="stage-backdrop flex min-h-[100dvh] items-center justify-center px-4">
      <div className="panel flex max-w-sm flex-col items-center gap-3 p-8 text-center">
        <p className="font-display text-2xl font-bold">{title}</p>
        <p className="text-sm leading-relaxed text-muted-foreground text-balance">{body}</p>
        {children}
      </div>
    </div>
  );
}
