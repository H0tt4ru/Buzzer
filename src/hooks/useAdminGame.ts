'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import { useGamePulse } from '@/hooks/useGamePulse';
import { useServerClock, useServerTick } from '@/hooks/useServerClock';
import { countdownRemaining, derivePhase } from '@/lib/game/phase';
import { playSound, setSoundEnabled, unlockAudio } from '@/lib/sound';
import { DEFAULT_SETTINGS } from '@/lib/game/settings';
import type { AdminAction, AdminSnapshot, ConnectionState, GamePhase } from '@/types/game';

/** Re-exported for the components that render before the first snapshot. */
export { DEFAULT_SETTINGS };

const POLL_MS = 5_000;
const MAX_CONSECUTIVE_403 = 3;

export interface ActionResult {
  ok: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

export interface UseAdminGameResult {
  loading: boolean;
  missing: boolean;
  unauthorized: boolean;
  snapshot: AdminSnapshot | null;
  phase: GamePhase;
  connection: ConnectionState;
  countdown: number;
  serverNow: number;
  /** Student ids present on the realtime channel right now. */
  presentIds: Set<string>;
  busy: AdminAction | null;
  soundOn: boolean;
  toggleSound: () => void;
  run: (action: AdminAction, payload?: Record<string, unknown>) => Promise<ActionResult>;
  refresh: () => Promise<void>;
}

/**
 * Core snapshot fetch. Called by:
 *  - Realtime (onResync / onPulse): no signal, no 403 counting
 *  - Mount:   no signal, no 403 counting
 *  - Actions (run):   no signal, no 403 counting
 *  - Poll (doPoll):   with signal and 403 counting (separate code path)
 *
 * Keeping it free of polling-specific logic means real-time calls can never
 * be interrupted by a polling abort, and the 403 counter is only tracked
 * through the dedicated polling path.
 */
async function fetchSnapshot(
  gameId: string,
  adminToken: string,
  signal?: AbortSignal,
): Promise<AdminSnapshot | null> {
  const response = await fetch(`/api/games/${gameId}/state`, {
    headers: { 'x-admin-token': adminToken },
    cache: 'no-store',
    signal,
  });

  if (response.status === 401 || response.status === 403) {
    throw { kind: 'unauthorized' as const };
  }
  if (response.status === 404) {
    throw { kind: 'missing' as const };
  }

  return (await response.json()) as AdminSnapshot;
}

/**
 * Teacher-side state. Mirrors the student hook, with two differences:
 *
 *  - Writes go through /api/games/[gameId]/actions rather than straight to the
 *    database, because the teacher's functions are service-role only.
 *  - The pulse is used as a change signal rather than as the data: when the
 *    revision moves, the dashboard re-fetches the full snapshot (roster,
 *    scores, history), none of which is readable with the anon key.
 */
export function useAdminGame(gameId: string, adminToken: string | null): UseAdminGameResult {
  const clock = useServerClock();
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const [busy, setBusy] = useState<AdminAction | null>(null);
  const [presentIds, setPresentIds] = useState<Set<string>>(() => new Set());
  const [soundOn, setSoundOn] = useState(true);

  const announcedRef = useRef<string | null>(null);
  const pollingStoppedRef = useRef(false);
  const consecutive403Ref = useRef(0);
  const pollAbortRef = useRef<AbortController | null>(null);
  const hasLoadedRef = useRef(false);

  // Base refresh — used by realtime callbacks, mount effect, and action dispatch.
  // No signal, no 403 counting, no polling termination.
  const refresh = useCallback(async () => {
    if (!adminToken || unauthorized || missing) return;
    try {
      if (!hasLoadedRef.current) setLoading(true);
      const body = await fetchSnapshot(gameId, adminToken);
      setSnapshot(body);
      setUnauthorized(false);
      setMissing(false);
      hasLoadedRef.current = true;
    } catch (err: unknown) {
      if ((err as { kind?: string }).kind === 'unauthorized') setUnauthorized(true);
      if ((err as { kind?: string }).kind === 'missing') setMissing(true);
    } finally {
      if (!hasLoadedRef.current) setLoading(false);
    }
  }, [gameId, adminToken, unauthorized, missing]);

  // Polling-only refresh — carries the abort signal and tracks 403s.
  const doPoll = useCallback(async () => {
    if (!adminToken || unauthorized || missing || pollingStoppedRef.current) return;
    const controller = pollAbortRef.current;
    if (!controller) return;
    try {
      if (!hasLoadedRef.current) setLoading(true);
      const body = await fetchSnapshot(gameId, adminToken, controller.signal);
      consecutive403Ref.current = 0;           // reset on any success
      setSnapshot(body);
      setUnauthorized(false);
      setMissing(false);
      hasLoadedRef.current = true;
      if (body?.game.status === 'ended') {
        pollingStoppedRef.current = true;       // no more polls; no abort needed
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const typed = err as { kind?: string };
      if (typed.kind === 'unauthorized') {
        consecutive403Ref.current += 1;
        if (consecutive403Ref.current >= MAX_CONSECUTIVE_403) {
          pollingStoppedRef.current = true;
          controller.abort();
          setUnauthorized(true);               // only here, at terminal
        }
      } else if (typed.kind === 'missing') {
        pollingStoppedRef.current = true;
        controller.abort();
        setMissing(true);
      }
    } finally {
      if (!hasLoadedRef.current) setLoading(false);
    }
  }, [gameId, adminToken, unauthorized, missing]);

  const { pulse, connection } = useGamePulse({
    gameId,
    onResync: () => void refresh(),
    onPulse: () => void refresh(),
  });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Backstop poll. Also what drives the disconnect reaper in admin_snapshot,
  // so a student whose phone died shows as Terputus within a few seconds even
  // if no other state changes. Stops itself after three consecutive 403s or
  // when the game ends, and aborts on unmount.
  useEffect(() => {
    pollingStoppedRef.current = false;
    consecutive403Ref.current = 0;

    const controller = new AbortController();
    pollAbortRef.current = controller;

    const timer = window.setInterval(() => {
      if (!pollingStoppedRef.current) void doPoll();
    }, POLL_MS);

    return () => {
      window.clearInterval(timer);
      controller.abort();
      pollAbortRef.current = null;
      pollingStoppedRef.current = true;
    };
  }, [doPoll]);

  // Presence: instant roster lights.
  useEffect(() => {
    if (!gameId) return;

    const supabase = getSupabase();
    let channel: RealtimeChannel | null = null;

    const sync = () => {
      const raw = channel?.presenceState() ?? {};
      setPresentIds(new Set(Object.keys(raw)));
    };

    channel = supabase
      .channel(`presence:${gameId}`, { config: { presence: { key: `teacher:${gameId}` } } })
      .on('presence', { event: 'sync' }, sync)
      .on('presence', { event: 'join' }, sync)
      .on('presence', { event: 'leave' }, sync)
      .subscribe();

    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [gameId]);

  /* ---------------------------------------------------------------------- */
  /* Derived                                                                */
  /* ---------------------------------------------------------------------- */

  const serverNow = useServerTick(clock, 100);

  const buzzerOpenAtMs = useMemo(() => {
    const iso = snapshot?.round?.buzzer_open_at ?? null;
    return iso ? new Date(iso).getTime() : null;
  }, [snapshot?.round?.buzzer_open_at]);

  const phase = derivePhase({
    status: snapshot?.game.status ?? 'lobby',
    roundState: snapshot?.round?.state ?? null,
    buzzerOpenAtMs,
    serverNowMs: serverNow,
    readyCheckEnabled: snapshot?.game.settings.require_all_ready ?? false,
  });

  const countdown = countdownRemaining(buzzerOpenAtMs, serverNow);

  useEffect(() => {
    setSoundEnabled(soundOn && (snapshot?.game.settings.sound_enabled ?? true));
  }, [soundOn, snapshot?.game.settings.sound_enabled]);

  const windowKey = snapshot?.round
    ? `${snapshot.round.id}:${snapshot.round.buzz_window}`
    : null;

  useEffect(() => {
    if (phase === 'BUZZER_ACTIVE' && announcedRef.current !== `active:${windowKey}`) {
      announcedRef.current = `active:${windowKey}`;
      playSound('buzzer_ready');
    } else if (phase === 'ROUND_COMPLETE' && announcedRef.current !== `won:${windowKey}`) {
      announcedRef.current = `won:${windowKey}`;
      if (snapshot?.round?.winner_student_id) playSound('win');
    } else if (phase === 'GAME_OVER' && announcedRef.current !== 'over') {
      announcedRef.current = 'over';
      playSound('leaderboard');
    }
  }, [phase, windowKey, snapshot?.round?.winner_student_id]);

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                */
  /* ---------------------------------------------------------------------- */

  const run = useCallback(
    async (action: AdminAction, payload: Record<string, unknown> = {}): Promise<ActionResult> => {
      if (!adminToken) return { ok: false, error: 'unauthorized' };

      unlockAudio();
      setBusy(action);

      try {
        const response = await fetch(`/api/games/${gameId}/actions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-admin-token': adminToken },
          body: JSON.stringify({ action, ...payload }),
        });

        const body = (await response.json()) as ActionResult & Record<string, unknown>;

        if (!response.ok || body.ok === false) {
          playSound('error');
          return { ok: false, error: typeof body.error === 'string' ? body.error : 'generic' };
        }

        playSound(
          action === 'pause_game'
            ? 'pause'
            : action === 'resume_game'
              ? 'resume'
              : action === 'next_round'
                ? 'round_start'
                : action === 'end_game'
                  ? 'game_over'
                  : 'click',
        );

        await refresh();
        return { ok: true, data: body };
      } catch {
        playSound('error');
        return { ok: false, error: 'network' };
      } finally {
        setBusy(null);
      }
    },
    [gameId, adminToken, refresh],
  );

  const toggleSound = useCallback(() => {
    unlockAudio();
    setSoundOn((previous) => {
      const next = !previous;
      setSoundEnabled(next);
      if (next) playSound('click');
      return next;
    });
  }, []);

  void pulse;

  return {
    loading,
    missing,
    unauthorized,
    snapshot,
    phase,
    connection,
    countdown,
    serverNow,
    presentIds,
    busy,
    soundOn,
    toggleSound,
    run,
    refresh,
  };
}
