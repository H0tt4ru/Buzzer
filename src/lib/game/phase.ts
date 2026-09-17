import type { BuzzBlockReason, GamePhase, GameStatus, RoundState } from '@/types/game';

/**
 * The state model.
 *
 * Postgres stores two orthogonal facts — a game status and a round state — plus
 * one timestamp. Every phase the interface can be in is a pure function of
 * those three. Nothing else is allowed to influence it, which is what keeps
 * combinations like "paused but the buzzer is somehow live" from existing:
 * they are not representable.
 *
 *   game.status = 'ended'                          -> GAME_OVER
 *   game.status = 'paused'                         -> PAUSED
 *   game.status = 'lobby'                          -> WAITING | READY_CHECK
 *   round = null | 'pending'                       -> WAITING | READY_CHECK
 *   round = 'armed'   and now <  buzzer_open_at     -> COUNTDOWN
 *   round = 'armed'   and now >= buzzer_open_at     -> BUZZER_ACTIVE
 *   round = 'locked' | 'complete'                  -> ROUND_COMPLETE
 *
 * Note the ordering: a paused game is PAUSED even if its round is armed, and
 * the round is silently re-armed on resume (see resume_game in SQL), so the
 * phase cannot jump straight back to BUZZER_ACTIVE under someone's finger.
 */
export interface PhaseInput {
  status: GameStatus;
  roundState: RoundState | null;
  /** Server-authoritative activation instant, epoch ms. */
  buzzerOpenAtMs: number | null;
  /** Current time expressed on the *server's* clock, epoch ms. */
  serverNowMs: number;
  /** Only meaningful before the first round: a readiness gate is configured. */
  readyCheckEnabled?: boolean;
}

export function derivePhase(input: PhaseInput): GamePhase {
  const { status, roundState, buzzerOpenAtMs, serverNowMs, readyCheckEnabled } = input;

  if (status === 'ended') return 'GAME_OVER';
  if (status === 'paused') return 'PAUSED';

  if (roundState === null || roundState === 'pending') {
    return readyCheckEnabled ? 'READY_CHECK' : 'WAITING';
  }

  if (roundState === 'armed') {
    if (buzzerOpenAtMs === null) return 'WAITING';
    return serverNowMs >= buzzerOpenAtMs ? 'BUZZER_ACTIVE' : 'COUNTDOWN';
  }

  // 'locked' (a winner holds the round) or 'complete' (teacher moved on).
  return 'ROUND_COMPLETE';
}

/** Whole seconds left on the countdown, clamped at 0. */
export function countdownRemaining(buzzerOpenAtMs: number | null, serverNowMs: number): number {
  if (buzzerOpenAtMs === null) return 0;
  return Math.max(0, Math.ceil((buzzerOpenAtMs - serverNowMs) / 1000));
}

/**
 * Whether this device may submit a press right now.
 *
 * Deliberately conservative: a press is only offered when the phase is live,
 * the realtime socket is healthy, and the state this decision rests on is
 * fresh. A student whose connection dropped may be looking at a screen that
 * says BUZZ while the round has already been won by someone else, so a stale
 * client is not allowed to try. The database re-checks all of it regardless —
 * this is about not lying to the student, not about security.
 */
export interface BuzzGateInput {
  phase: GamePhase;
  connection: 'connecting' | 'connected' | 'reconnecting' | 'offline';
  /** ms since the last authoritative sync with the server. */
  stateAgeMs: number;
  alreadyBuzzedThisWindow: boolean;
  excluded: boolean;
  submitting: boolean;
}

/** State older than this is treated as untrustworthy. */
export const STALE_STATE_MS = 20_000;

export function canBuzz(input: BuzzGateInput): boolean {
  return (
    input.phase === 'BUZZER_ACTIVE' &&
    input.connection === 'connected' &&
    input.stateAgeMs < STALE_STATE_MS &&
    !input.alreadyBuzzedThisWindow &&
    !input.excluded &&
    !input.submitting
  );
}

export function buzzBlockReason(input: BuzzGateInput): BuzzBlockReason {
  if (canBuzz(input)) return 'none';
  if (input.connection === 'offline' || input.connection === 'reconnecting') return 'offline';
  if (input.phase === 'BUZZER_ACTIVE' && input.stateAgeMs >= STALE_STATE_MS) return 'stale';
  if (input.excluded) return 'excluded';
  if (input.alreadyBuzzedThisWindow) return 'already_buzzed';
  return 'phase';
}
