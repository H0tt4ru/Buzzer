import { t } from '@/lib/i18n';
import type { GameEvent } from '@/types/game';

/**
 * Renders an immutable English event row as Indonesian prose. Keeping this a
 * pure function of (type, payload) is what lets the history stay append-only:
 * a correction is a new row with its own type, never an edit.
 */
export function describeEvent(event: GameEvent): string {
  const who = event.student_name ?? 'Siswa';
  const round = event.round_number ?? 0;
  const payload = event.payload ?? {};

  switch (event.type) {
    case 'game_created':
      return t.events.game_created;
    case 'student_link_created':
      return t.events.student_link_created(who);
    case 'student_connected':
      return t.events.student_connected(who);
    case 'student_disconnected':
      return t.events.student_disconnected(who);
    case 'student_ready':
      return t.events.student_ready(who);
    case 'student_unready':
      return t.events.student_unready(who);
    case 'student_renamed':
      return t.events.student_renamed(String(payload.from ?? '—'), String(payload.to ?? '—'));
    case 'round_started':
      return t.events.round_started(round);
    case 'buzzer_enabled':
      return payload.mode === 'auto' ? t.events.buzzer_enabled_auto : t.events.buzzer_enabled;
    case 'buzzer_disabled':
      return t.events.buzzer_disabled;
    case 'student_buzzed':
      return payload.outcome === 'first'
        ? t.events.student_buzzed_first(who)
        : t.events.student_buzzed_late(who);
    case 'winner_determined':
      return t.events.winner_determined(who, round);
    case 'points_awarded':
      return t.events.points_awarded(who, Number(payload.points ?? 1));
    case 'winner_undone':
      return t.events.winner_undone(who);
    case 'buzzer_reopened':
      return t.events.buzzer_reopened(who);
    case 'game_paused':
      return t.events.game_paused;
    case 'game_resumed':
      return t.events.game_resumed;
    case 'game_ended':
      return t.events.game_ended;
    case 'settings_updated':
      return t.events.settings_updated;
    default:
      return t.events.unknown(event.type);
  }
}

/** Tone of the history row, used for the marker colour. */
export type EventTone = 'neutral' | 'good' | 'warn' | 'bad';

export function eventTone(event: GameEvent): EventTone {
  switch (event.type) {
    case 'winner_determined':
    case 'points_awarded':
    case 'student_ready':
    case 'student_connected':
      return 'good';
    case 'winner_undone':
    case 'buzzer_reopened':
    case 'game_paused':
    case 'student_unready':
      return 'warn';
    case 'student_disconnected':
    case 'game_ended':
      return 'bad';
    default:
      return 'neutral';
  }
}
