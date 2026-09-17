import { describe, expect, it } from 'vitest';
import {
  buzzBlockReason,
  canBuzz,
  countdownRemaining,
  derivePhase,
  STALE_STATE_MS,
  type BuzzGateInput,
} from '@/lib/game/phase';

const NOW = 1_700_000_000_000;

function phase(overrides: Partial<Parameters<typeof derivePhase>[0]> = {}) {
  return derivePhase({
    status: 'active',
    roundState: null,
    buzzerOpenAtMs: null,
    serverNowMs: NOW,
    ...overrides,
  });
}

describe('derivePhase', () => {
  it('reports GAME_OVER regardless of what the round says', () => {
    expect(phase({ status: 'ended', roundState: 'armed', buzzerOpenAtMs: NOW - 1 })).toBe(
      'GAME_OVER',
    );
  });

  it('reports PAUSED even when the round is armed and the window has opened', () => {
    // The ordering matters: a paused game must never present a live buzzer,
    // which is the combination that would let a student buzz into a pause.
    expect(phase({ status: 'paused', roundState: 'armed', buzzerOpenAtMs: NOW - 5_000 })).toBe(
      'PAUSED',
    );
  });

  it('waits before the first round', () => {
    expect(phase({ status: 'lobby' })).toBe('WAITING');
  });

  it('asks for readiness when the gate is configured', () => {
    expect(phase({ status: 'lobby', readyCheckEnabled: true })).toBe('READY_CHECK');
  });

  it('counts down until the server activation instant', () => {
    expect(phase({ roundState: 'armed', buzzerOpenAtMs: NOW + 2_400 })).toBe('COUNTDOWN');
  });

  it('opens the buzzer exactly at the activation instant', () => {
    expect(phase({ roundState: 'armed', buzzerOpenAtMs: NOW })).toBe('BUZZER_ACTIVE');
    expect(phase({ roundState: 'armed', buzzerOpenAtMs: NOW - 1 })).toBe('BUZZER_ACTIVE');
    expect(phase({ roundState: 'armed', buzzerOpenAtMs: NOW + 1 })).toBe('COUNTDOWN');
  });

  it('falls back to waiting if a round is armed with no timestamp', () => {
    expect(phase({ roundState: 'armed', buzzerOpenAtMs: null })).toBe('WAITING');
  });

  it('treats a locked or completed round as finished', () => {
    expect(phase({ roundState: 'locked' })).toBe('ROUND_COMPLETE');
    expect(phase({ roundState: 'complete' })).toBe('ROUND_COMPLETE');
  });

  it('is a pure function of its three inputs', () => {
    const input = {
      status: 'active',
      roundState: 'armed',
      buzzerOpenAtMs: NOW + 1_000,
      serverNowMs: NOW,
    } as const;
    expect(derivePhase(input)).toBe(derivePhase(input));
  });
});

describe('countdownRemaining', () => {
  it('rounds up so the last fraction of a second still shows 1', () => {
    expect(countdownRemaining(NOW + 1, NOW)).toBe(1);
    expect(countdownRemaining(NOW + 2_001, NOW)).toBe(3);
  });

  it('never goes negative', () => {
    expect(countdownRemaining(NOW - 10_000, NOW)).toBe(0);
  });

  it('is zero with no armed round', () => {
    expect(countdownRemaining(null, NOW)).toBe(0);
  });
});

describe('canBuzz', () => {
  const base: BuzzGateInput = {
    phase: 'BUZZER_ACTIVE',
    connection: 'connected',
    stateAgeMs: 500,
    alreadyBuzzedThisWindow: false,
    excluded: false,
    submitting: false,
  };

  it('allows a press when everything is live and fresh', () => {
    expect(canBuzz(base)).toBe(true);
  });

  it.each([
    ['the phase is not live', { phase: 'COUNTDOWN' } as const],
    ['the socket is reconnecting', { connection: 'reconnecting' } as const],
    ['the socket is offline', { connection: 'offline' } as const],
    ['the state is stale', { stateAgeMs: STALE_STATE_MS } as const],
    ['this student already pressed', { alreadyBuzzedThisWindow: true } as const],
    ['this student is excluded', { excluded: true } as const],
    ['a press is already in flight', { submitting: true } as const],
  ])('refuses when %s', (_label, override) => {
    expect(canBuzz({ ...base, ...override })).toBe(false);
  });

  it('refuses stale state even while the phase says the buzzer is live', () => {
    // This is the case that matters: the screen says BUZZ but this device has
    // not heard from the server in 20s, so the round may already be won.
    expect(canBuzz({ ...base, stateAgeMs: 25_000 })).toBe(false);
  });
});

describe('buzzBlockReason', () => {
  const base: BuzzGateInput = {
    phase: 'BUZZER_ACTIVE',
    connection: 'connected',
    stateAgeMs: 100,
    alreadyBuzzedThisWindow: false,
    excluded: false,
    submitting: false,
  };

  it('is none when the press is allowed', () => {
    expect(buzzBlockReason(base)).toBe('none');
  });

  it('blames the connection before anything else', () => {
    expect(buzzBlockReason({ ...base, connection: 'offline', excluded: true })).toBe('offline');
  });

  it('distinguishes a stale client from a closed buzzer', () => {
    expect(buzzBlockReason({ ...base, stateAgeMs: 30_000 })).toBe('stale');
    expect(buzzBlockReason({ ...base, phase: 'ROUND_COMPLETE' })).toBe('phase');
  });

  it('reports exclusion and prior presses', () => {
    expect(buzzBlockReason({ ...base, excluded: true })).toBe('excluded');
    expect(buzzBlockReason({ ...base, alreadyBuzzedThisWindow: true })).toBe('already_buzzed');
  });
});
