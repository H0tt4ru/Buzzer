import { describe, expect, it } from 'vitest';
import { describeEvent, eventTone } from '@/lib/game/events';
import { adminErrorMessage, buzzErrorMessage, t } from '@/lib/i18n';
import type { GameEvent, GameEventType } from '@/types/game';

function event(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    id: 1,
    type: 'round_started',
    actor: 'teacher',
    student_id: null,
    student_name: null,
    round_number: 1,
    payload: {},
    created_at: '2026-01-01T08:00:00.000Z',
    ...overrides,
  };
}

const ALL_TYPES: GameEventType[] = [
  'game_created',
  'student_link_created',
  'student_connected',
  'student_disconnected',
  'student_ready',
  'student_unready',
  'student_renamed',
  'round_started',
  'buzzer_enabled',
  'buzzer_disabled',
  'student_buzzed',
  'winner_determined',
  'points_awarded',
  'winner_undone',
  'buzzer_reopened',
  'game_paused',
  'game_resumed',
  'game_ended',
  'settings_updated',
];

describe('describeEvent', () => {
  it('describes every event type the database can write', () => {
    for (const type of ALL_TYPES) {
      const text = describeEvent(event({ type, student_name: 'Andi' }));
      expect(text.length, `no description for ${type}`).toBeGreaterThan(0);
      // A missed case would fall through to the generic "Kejadian: <type>".
      expect(text, `${type} fell through to the default branch`).not.toContain('Kejadian:');
    }
  });

  it('names the student where the event is about one', () => {
    expect(describeEvent(event({ type: 'student_ready', student_name: 'Citra' }))).toContain(
      'Citra',
    );
  });

  it('distinguishes the first press from a late one', () => {
    const first = describeEvent(
      event({ type: 'student_buzzed', student_name: 'Andi', payload: { outcome: 'first' } }),
    );
    const late = describeEvent(
      event({ type: 'student_buzzed', student_name: 'Budi', payload: { outcome: 'late' } }),
    );
    expect(first).not.toBe(late);
    expect(late).toContain('terlambat');
  });

  it('distinguishes a manual activation from an automatic one', () => {
    expect(describeEvent(event({ type: 'buzzer_enabled', payload: { mode: 'auto' } }))).not.toBe(
      describeEvent(event({ type: 'buzzer_enabled', payload: {} })),
    );
  });

  it('reads a rename out of the payload', () => {
    const text = describeEvent(
      event({ type: 'student_renamed', payload: { from: 'Siswa 1', to: 'Andi' } }),
    );
    expect(text).toContain('Siswa 1');
    expect(text).toContain('Andi');
  });

  it('falls back to a placeholder rather than printing "null"', () => {
    expect(describeEvent(event({ type: 'student_connected', student_name: null }))).not.toContain(
      'null',
    );
  });

  it('survives an unknown type from a future migration', () => {
    expect(describeEvent(event({ type: 'something_new' }))).toContain('something_new');
  });

  it('survives a missing payload', () => {
    const bare = { ...event({ type: 'points_awarded', student_name: 'Andi' }) };
    // @ts-expect-error — exercising a row that predates the payload column.
    bare.payload = undefined;
    expect(() => describeEvent(bare)).not.toThrow();
  });
});

describe('eventTone', () => {
  it('marks wins and points as good', () => {
    expect(eventTone(event({ type: 'winner_determined' }))).toBe('good');
    expect(eventTone(event({ type: 'points_awarded' }))).toBe('good');
  });

  it('marks reversals and pauses as warnings, not failures', () => {
    expect(eventTone(event({ type: 'winner_undone' }))).toBe('warn');
    expect(eventTone(event({ type: 'buzzer_reopened' }))).toBe('warn');
    expect(eventTone(event({ type: 'game_paused' }))).toBe('warn');
  });

  it('marks disconnects and the end of the game as bad', () => {
    expect(eventTone(event({ type: 'student_disconnected' }))).toBe('bad');
    expect(eventTone(event({ type: 'game_ended' }))).toBe('bad');
  });

  it('defaults to neutral', () => {
    expect(eventTone(event({ type: 'settings_updated' }))).toBe('neutral');
  });
});

describe('error message mapping', () => {
  it('translates every rejection reason student_buzz can return', () => {
    const reasons = [
      'game_ended',
      'game_paused',
      'game_not_started',
      'no_round',
      'buzzer_closed',
      'too_early',
      'excluded',
      'no_game',
    ];
    for (const reason of reasons) {
      expect(buzzErrorMessage(reason), reason).not.toBe(t.errors.generic);
    }
  });

  it('translates the teacher-side failures', () => {
    const codes = [
      'no_round',
      'no_winner',
      'already_awarded',
      'not_all_ready',
      'game_paused',
      'student_not_found',
    ];
    for (const code of codes) {
      expect(adminErrorMessage(code), code).not.toBe(t.errors.generic);
    }
  });

  it('falls back to the generic message for anything unrecognised', () => {
    expect(adminErrorMessage('a_code_from_the_future')).toBe(t.errors.generic);
    expect(adminErrorMessage(undefined)).toBe(t.errors.generic);
    expect(buzzErrorMessage(undefined)).toBe(t.errors.generic);
  });
});

describe('Indonesian copy', () => {
  it('has a label for every phase the state machine can produce', () => {
    const phases = [
      'WAITING',
      'READY_CHECK',
      'COUNTDOWN',
      'BUZZER_ACTIVE',
      'ROUND_COMPLETE',
      'PAUSED',
      'GAME_OVER',
    ] as const;
    for (const phase of phases) {
      expect(t.phase[phase]?.length, phase).toBeGreaterThan(0);
    }
  });

  it('has a label for every connection state', () => {
    for (const state of ['connecting', 'connected', 'reconnecting', 'offline'] as const) {
      expect(t.connection[state].length, state).toBeGreaterThan(0);
    }
  });
});
