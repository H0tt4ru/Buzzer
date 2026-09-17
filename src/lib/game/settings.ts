import type { GameSettings } from '@/types/game';

/**
 * The defaults, mirroring the `settings` column default in
 * supabase/migrations/0001_schema.sql. The database is authoritative; this
 * copy exists so the UI has something sensible to render before the first
 * snapshot lands, and so tests can build a settings object without a hook.
 *
 * Adding a setting means three edits: this object, the whitelist in
 * sanitize_settings(), and the column default. The whitelist is what actually
 * gates writes, so a key missing there is silently ignored rather than stored.
 */
export const DEFAULT_SETTINGS: GameSettings = {
  points_per_win: 1,
  buzzer_mode: 'manual',
  countdown_seconds: 3,
  sound_enabled: true,
  live_leaderboard: true,
  student_leaderboard: false,
  require_all_ready: false,
  award_mode: 'auto',
  exclude_previous_on_reopen: true,
};
