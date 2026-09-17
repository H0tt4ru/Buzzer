/**
 * Domain types. These mirror the database contract in supabase/migrations and
 * are the only shape the UI is allowed to reason about.
 */

export type GameStatus = 'lobby' | 'active' | 'paused' | 'ended';

/** Round-level state as stored in Postgres. */
export type RoundState = 'pending' | 'armed' | 'locked' | 'complete';

/**
 * The single phase the UI renders from. Derived — never stored — from
 * (game status, round state, server clock) by derivePhase().
 */
export type GamePhase =
  | 'WAITING'
  | 'READY_CHECK'
  | 'COUNTDOWN'
  | 'BUZZER_ACTIVE'
  | 'ROUND_COMPLETE'
  | 'PAUSED'
  | 'GAME_OVER';

export type BuzzerMode = 'manual' | 'auto';
export type AwardMode = 'auto' | 'manual';
export type CountdownSeconds = 0 | 3 | 5;

export interface GameSettings {
  points_per_win: number;
  buzzer_mode: BuzzerMode;
  countdown_seconds: CountdownSeconds;
  sound_enabled: boolean;
  /** Teacher-side live standings. */
  live_leaderboard: boolean;
  /** Whether students may see the standings mid-game. */
  student_leaderboard: boolean;
  require_all_ready: boolean;
  award_mode: AwardMode;
  exclude_previous_on_reopen: boolean;
}

/** The realtime row every client subscribes to. */
export interface GamePulse {
  game_id: string;
  revision: number;
  status: GameStatus;
  current_round_number: number;
  round_id: string | null;
  round_state: RoundState | null;
  buzz_window: number;
  buzzer_open_at: string | null;
  winner_student_id: string | null;
  winner_name: string | null;
  student_count: number;
  ready_count: number;
  buzzed_count: number;
  settings: Partial<GameSettings>;
  updated_at: string;
  /** Human-readable label for the state transition that produced this row. */
  last_event: string | null;
}

export interface StudentIdentity {
  id: string;
  name: string;
  is_ready: boolean;
  seat_index: number;
}

export interface StudentRoundView {
  id: string;
  number: number;
  state: RoundState;
  buzz_window: number;
  buzzer_open_at: string | null;
  winner_student_id: string | null;
  winner_name: string | null;
  /** Student lost their turn in this round after a wrong answer. */
  excluded: boolean;
}

export interface MyBuzz {
  id: string;
  buzz_window: number;
  accepted: boolean;
  pressed_at: string;
}

export interface LeaderboardRow {
  id: string;
  name: string;
  score: number;
  wins: number;
  rank: number;
  seat_index?: number;
}

/** Payload of student_state() / student_sync(). */
export interface StudentState {
  ok: true;
  server_time: string;
  student: StudentIdentity;
  game: {
    id: string;
    status: GameStatus;
    settings: Pick<
      GameSettings,
      'countdown_seconds' | 'sound_enabled' | 'require_all_ready' | 'student_leaderboard'
    >;
  };
  round: StudentRoundView | null;
  my_buzz: MyBuzz | null;
  revision: number;
  counts: { students: number; ready: number; buzzed: number };
  leaderboard: LeaderboardRow[] | null;
}

export type StudentStateResult = StudentState | { ok: false; error: string };

export type BuzzResult =
  | { ok: true; result: 'won'; round_id: string; winner_name: string; duplicate?: boolean }
  | { ok: true; result: 'too_late'; round_id: string; winner_name: string | null }
  | { ok: true; result: 'duplicate'; round_id: string }
  | { ok: false; result: 'invalid_token' }
  | {
      ok: false;
      result: 'rejected';
      reason:
        | 'game_ended'
        | 'game_paused'
        | 'game_not_started'
        | 'no_game'
        | 'no_round'
        | 'buzzer_closed'
        | 'too_early'
        | 'excluded';
      buzzer_open_at?: string;
    };

/* --------------------------------------------------------------------------
 * Teacher side
 * ------------------------------------------------------------------------ */

export interface AdminStudentRow {
  id: string;
  seat_index: number;
  name: string;
  token: string;
  is_ready: boolean;
  connected: boolean;
  last_seen_at: string | null;
  score: number;
  wins: number;
  buzzed_this_round: boolean;
  buzzed_at: string | null;
  is_round_winner: boolean;
}

export interface AdminRoundView {
  id: string;
  number: number;
  state: RoundState;
  buzz_window: number;
  buzzer_open_at: string | null;
  winner_student_id: string | null;
  points_awarded: boolean;
  awarded_points: number;
  excluded_student_ids: string[];
}

export type GameEventType =
  | 'game_created'
  | 'student_link_created'
  | 'student_connected'
  | 'student_disconnected'
  | 'student_ready'
  | 'student_unready'
  | 'student_renamed'
  | 'round_started'
  | 'buzzer_enabled'
  | 'buzzer_disabled'
  | 'student_buzzed'
  | 'winner_determined'
  | 'points_awarded'
  | 'winner_undone'
  | 'buzzer_reopened'
  | 'game_paused'
  | 'game_resumed'
  | 'game_ended'
  | 'settings_updated';

export interface GameEvent {
  id: number;
  type: GameEventType | string;
  actor: 'system' | 'teacher' | 'student';
  student_id: string | null;
  student_name: string | null;
  round_number: number | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface AdminSnapshot {
  ok: true;
  server_time: string;
  revision: number;
  game: {
    id: string;
    join_code: string;
    status: GameStatus;
    current_round_number: number;
    settings: GameSettings;
    created_at: string;
    started_at: string | null;
    ended_at: string | null;
  };
  round: AdminRoundView | null;
  students: AdminStudentRow[];
  leaderboard: LeaderboardRow[];
  events: GameEvent[];
}

export type AdminAction =
  | 'next_round'
  | 'enable_buzzer'
  | 'disable_buzzer'
  | 'award_point'
  | 'undo_winner'
  | 'reopen_buzzer'
  | 'pause_game'
  | 'resume_game'
  | 'end_game'
  | 'clear_game'
  | 'update_settings'
  | 'add_students'
  | 'rename_student';

export interface CreatedGame {
  ok: true;
  game_id: string;
  join_code: string;
  admin_token: string;
  students: { id: string; seat_index: number; name: string; token: string }[];
}

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

/** Why the buzzer is not pressable — drives the label the student sees. */
export type BuzzBlockReason =
  | 'none'
  | 'stale'
  | 'offline'
  | 'excluded'
  | 'already_buzzed'
  | 'phase';

/** This student's position in the current buzzer window. */
export type StudentOutcome = 'none' | 'buzzed' | 'won' | 'too_late';
