'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import { useGamePulse } from '@/hooks/useGamePulse';
import { useServerClock, useServerTick } from '@/hooks/useServerClock';
import { buzzBlockReason, canBuzz, countdownRemaining, derivePhase } from '@/lib/game/phase';
import { playSound, setSoundEnabled, unlockAudio } from '@/lib/sound';
import type {
  BuzzBlockReason,
  BuzzResult,
  GamePhase,
  LeaderboardRow,
  StudentOutcome,
  StudentState,
  StudentStateResult,
} from '@/types/game';

const HEARTBEAT_MS = 10_000;

export interface UseStudentGameResult {
  loading: boolean;
  error: 'invalid_token' | 'network' | null;
  state: StudentState | null;
  phase: GamePhase;
  connection: 'connecting' | 'connected' | 'reconnecting' | 'offline';
  countdown: number;
  serverNow: number;
  buzzable: boolean;
  blockReason: BuzzBlockReason;
  outcome: StudentOutcome;
  winnerName: string | null;
  isWinner: boolean;
  submitting: boolean;
  leaderboard: LeaderboardRow[] | null;
  soundOn: boolean;
  toggleSound: () => void;
  buzz: () => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  resync: () => Promise<void>;
  lastFeedback: string | null;
  clearFeedback: () => void;
}

/**
 * Everything a student's device does, in one place:
 * clock sync -> realtime pulse -> authoritative re-sync -> derived phase.
 *
 * The pulse gives an instant optimistic transition (so the buzzer turns on the
 * moment the message lands) and every pulse also triggers student_sync, which
 * returns the authoritative record of this particular student's position in
 * the round — whether they already pressed, whether they are excluded, whether
 * they hold the win. Rendering from the pulse alone would be enough for the
 * shared state but not for "did *I* press", which is per-student.
 */
export function useStudentGame(token: string): UseStudentGameResult {
  const clock = useServerClock();
  const [state, setState] = useState<StudentState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'invalid_token' | 'network' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<StudentOutcome>('none');
  const [soundOn, setSoundOn] = useState(true);
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState(0);

  // Refs so the buzz handler can read current values without being rebuilt
  // (a stale closure here would be a bug that only shows up under pressure).
  const stateRef = useRef<StudentState | null>(null);
  const pressedWindowRef = useRef<string | null>(null);
  const announcedRef = useRef<string | null>(null);
  const readyChimeRef = useRef(false);

  stateRef.current = state;

  const gameId = state?.game.id ?? null;

  /* ---------------------------------------------------------------------- */
  /* Authoritative re-sync                                                  */
  /* ---------------------------------------------------------------------- */

  const resync = useCallback(async () => {
    try {
      const supabase = getSupabase();
      const { data, error: rpcError } = await supabase.rpc('student_sync', { p_token: token });

      if (rpcError) {
        setError('network');
        return;
      }

      const result = data as StudentStateResult;
      if (!result || result.ok !== true) {
        setError('invalid_token');
        setLoading(false);
        return;
      }

      setError(null);
      setState(result);
      setSyncedAt(Date.now());
      setLoading(false);
    } catch {
      setError('network');
    }
  }, [token]);

  /* ---------------------------------------------------------------------- */
  /* Realtime                                                               */
  /* ---------------------------------------------------------------------- */

  const { pulse, connection } = useGamePulse({
    gameId,
    onResync: () => void resync(),
    onPulse: (row) => {
      // Fast path: fold the shared parts of the pulse straight into local
      // state so the transition is not waiting on a second round trip. The
      // student-specific parts (my_buzz, excluded) arrive with the resync that
      // follows immediately after.
      setState((previous) => {
        if (!previous) return previous;
        if (row.revision < previous.revision) return previous;

        const sameRound = previous.round?.id === row.round_id;

        return {
          ...previous,
          revision: row.revision,
          game: { ...previous.game, status: row.status },
          round:
            row.round_id === null
              ? null
              : {
                  id: row.round_id,
                  number: row.current_round_number,
                  state: row.round_state ?? 'pending',
                  buzz_window: row.buzz_window,
                  buzzer_open_at: row.buzzer_open_at,
                  winner_student_id: row.winner_student_id,
                  winner_name: row.winner_name,
                  excluded: sameRound ? (previous.round?.excluded ?? false) : false,
                },
          my_buzz:
            sameRound && previous.my_buzz?.buzz_window === row.buzz_window
              ? previous.my_buzz
              : null,
          counts: {
            students: row.student_count,
            ready: row.ready_count,
            buzzed: row.buzzed_count,
          },
        };
      });
      void resync();
    },
  });

  useEffect(() => {
    void resync();
  }, [resync]);

  // Heartbeat. Doubles as the anti-stale guard: if these stop landing, the
  // buzzer gate below closes on its own.
  useEffect(() => {
    const timer = window.setInterval(() => void resync(), HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [resync]);

  // Presence: an immediate join/leave signal for the teacher's roster, on top
  // of the heartbeat that catches devices which vanish without saying goodbye.
  useEffect(() => {
    if (!gameId || !state) return;

    const supabase = getSupabase();
    let channel: RealtimeChannel | null = null;

    channel = supabase.channel(`presence:${gameId}`, {
      config: { presence: { key: state.student.id } },
    });

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        void channel?.track({ student_id: state.student.id, name: state.student.name });
      }
    });

    return () => {
      if (channel) void supabase.removeChannel(channel);
    };
  }, [gameId, state]);

  // Best-effort "leaving now" so the roster light goes out immediately.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        void getSupabase().rpc('student_offline', { p_token: token });
      }
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [token]);

  /* ---------------------------------------------------------------------- */
  /* Derived state                                                          */
  /* ---------------------------------------------------------------------- */

  const serverNow = useServerTick(clock, 100);

  const buzzerOpenAtMs = useMemo(() => {
    const iso = state?.round?.buzzer_open_at ?? null;
    return iso ? new Date(iso).getTime() : null;
  }, [state?.round?.buzzer_open_at]);

  const phase = derivePhase({
    status: state?.game.status ?? 'lobby',
    roundState: state?.round?.state ?? null,
    buzzerOpenAtMs,
    serverNowMs: serverNow,
    readyCheckEnabled:
      (state?.game.settings.require_all_ready ?? false) && !(state?.student.is_ready ?? false),
  });

  const countdown = countdownRemaining(buzzerOpenAtMs, serverNow);

  const currentWindowKey = state?.round ? `${state.round.id}:${state.round.buzz_window}` : null;
  const alreadyBuzzed =
    (state?.my_buzz != null && state.my_buzz.buzz_window === state.round?.buzz_window) ||
    pressedWindowRef.current === currentWindowKey;

  const gateInput = {
    phase,
    connection,
    stateAgeMs: syncedAt === 0 ? Number.POSITIVE_INFINITY : Date.now() - syncedAt,
    alreadyBuzzedThisWindow: alreadyBuzzed,
    excluded: state?.round?.excluded ?? false,
    submitting,
  };

  const buzzable = canBuzz(gateInput);
  const blockReason = buzzBlockReason(gateInput);

  const isWinner =
    state?.round?.winner_student_id != null &&
    state.round.winner_student_id === state.student.id;

  /* ---------------------------------------------------------------------- */
  /* Sound and outcome cues                                                 */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    setSoundEnabled(soundOn && (state?.game.settings.sound_enabled ?? true));
  }, [soundOn, state?.game.settings.sound_enabled]);

  // Reset the per-round outcome whenever the buzzer window changes.
  useEffect(() => {
    if (!currentWindowKey) return;
    if (pressedWindowRef.current !== currentWindowKey) {
      setOutcome('none');
    }
  }, [currentWindowKey]);

  useEffect(() => {
    if (phase === 'BUZZER_ACTIVE' && announcedRef.current !== `active:${currentWindowKey}`) {
      announcedRef.current = `active:${currentWindowKey}`;
      playSound('buzzer_ready');
    }
    if (phase === 'ROUND_COMPLETE' && announcedRef.current !== `done:${currentWindowKey}`) {
      announcedRef.current = `done:${currentWindowKey}`;
      playSound(isWinner ? 'win' : 'lose');
    }
    if (phase === 'GAME_OVER' && announcedRef.current !== 'over') {
      announcedRef.current = 'over';
      playSound('game_over');
    }
    if (phase === 'PAUSED' && announcedRef.current !== 'paused') {
      announcedRef.current = 'paused';
      playSound('pause');
    }
  }, [phase, currentWindowKey, isWinner]);

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                */
  /* ---------------------------------------------------------------------- */

  const buzz = useCallback(async () => {
    const snapshot = stateRef.current;
    if (!snapshot?.round) return;

    const key = `${snapshot.round.id}:${snapshot.round.buzz_window}`;

    // Local double-tap guard. Synchronous and ref-based, so a second tap 5ms
    // later cannot slip through before React has re-rendered. The unique
    // constraint in Postgres is the real guarantee; this just avoids sending
    // requests nobody needs.
    if (pressedWindowRef.current === key || submitting) return;
    pressedWindowRef.current = key;

    setSubmitting(true);
    setOutcome('buzzed');
    playSound('buzzer_press');
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate?.(35);
      } catch {
        /* not supported */
      }
    }

    try {
      const supabase = getSupabase();
      const { data, error: rpcError } = await supabase.rpc('student_buzz', { p_token: token });

      if (rpcError) {
        // The request itself failed, so this student never got an attempt in.
        // Release the local lock and let them try again.
        pressedWindowRef.current = null;
        setOutcome('none');
        setLastFeedback('network');
        return;
      }

      const result = data as BuzzResult;

      if (result.result === 'won') {
        setOutcome('won');
      } else if (result.result === 'too_late') {
        setOutcome('too_late');
        playSound('lose');
      } else if (result.result === 'duplicate') {
        setOutcome('buzzed');
      } else {
        pressedWindowRef.current = null;
        setOutcome('none');
        setLastFeedback('reason' in result ? result.reason : 'generic');
      }
    } catch {
      pressedWindowRef.current = null;
      setOutcome('none');
      setLastFeedback('network');
    } finally {
      setSubmitting(false);
      void resync();
    }
  }, [token, submitting, resync]);

  const setReady = useCallback(
    async (ready: boolean) => {
      unlockAudio();
      if (!readyChimeRef.current) {
        readyChimeRef.current = true;
      }
      playSound(ready ? 'ready' : 'click');

      try {
        const supabase = getSupabase();
        const { data } = await supabase.rpc('student_set_ready', {
          p_token: token,
          p_ready: ready,
        });
        const result = data as StudentStateResult | null;
        if (result && result.ok === true) {
          setState(result);
          setSyncedAt(Date.now());
        }
      } catch {
        setLastFeedback('network');
      }
    },
    [token],
  );

  const clearFeedback = useCallback(() => setLastFeedback(null), []);

  const toggleSound = useCallback(() => {
    unlockAudio();
    setSoundOn((previous) => {
      const next = !previous;
      setSoundEnabled(next);
      if (next) playSound('click');
      return next;
    });
  }, []);

  return {
    loading,
    error,
    state,
    phase,
    connection,
    countdown,
    serverNow,
    buzzable,
    blockReason,
    outcome,
    winnerName: state?.round?.winner_name ?? pulse?.winner_name ?? null,
    isWinner,
    submitting,
    leaderboard: state?.leaderboard ?? null,
    soundOn,
    toggleSound,
    buzz,
    setReady,
    resync,
    lastFeedback,
    clearFeedback,
  };
}
