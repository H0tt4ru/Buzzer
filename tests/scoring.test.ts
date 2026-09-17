import { describe, expect, it } from 'vitest';
import { podiumOrder, pointsForRound, rankStandings, RULES } from '@/lib/game/scoring';
import { DEFAULT_SETTINGS } from '@/lib/game/settings';
import type { GameSettings } from '@/types/game';

const settings = (overrides: Partial<GameSettings> = {}): GameSettings => ({
  ...DEFAULT_SETTINGS,
  ...overrides,
});

const result = { roundNumber: 1, winnerStudentId: 'a', reactionMs: 420 };

describe('pointsForRound', () => {
  it('awards the configured points', () => {
    expect(pointsForRound(result, settings({ points_per_win: 5 }))).toBe(5);
  });

  it('never awards negative points', () => {
    expect(pointsForRound(result, settings({ points_per_win: -3 }))).toBe(0);
  });

  it('supports a zero-point round for practice games', () => {
    expect(pointsForRound(result, settings({ points_per_win: 0 }))).toBe(0);
  });

  it('is the sum of the rule list, so a new rule needs no change here', () => {
    const manual = RULES.reduce(
      (total, rule) => total + rule.points(result, settings({ points_per_win: 2 })),
      0,
    );
    expect(pointsForRound(result, settings({ points_per_win: 2 }))).toBe(manual);
  });
});

describe('rankStandings', () => {
  it('orders by score descending', () => {
    const board = rankStandings([
      { id: 'a', name: 'Andi', score: 1, wins: 1, seat_index: 1 },
      { id: 'b', name: 'Budi', score: 4, wins: 4, seat_index: 2 },
      { id: 'c', name: 'Citra', score: 2, wins: 2, seat_index: 3 },
    ]);
    expect(board.map((row) => row.name)).toEqual(['Budi', 'Citra', 'Andi']);
    expect(board.map((row) => row.rank)).toEqual([1, 2, 3]);
  });

  it('gives tied students the same rank and skips the next one', () => {
    const board = rankStandings([
      { id: 'a', name: 'Andi', score: 3, wins: 3, seat_index: 1 },
      { id: 'b', name: 'Budi', score: 3, wins: 3, seat_index: 2 },
      { id: 'c', name: 'Citra', score: 1, wins: 1, seat_index: 3 },
    ]);
    expect(board.map((row) => row.rank)).toEqual([1, 1, 3]);
  });

  it('breaks a score tie on wins, so fewer rounds for the same points ranks higher', () => {
    const board = rankStandings([
      { id: 'a', name: 'Andi', score: 6, wins: 2, seat_index: 1 },
      { id: 'b', name: 'Budi', score: 6, wins: 6, seat_index: 2 },
    ]);
    expect(board[0]?.name).toBe('Budi');
    expect(board.map((row) => row.rank)).toEqual([1, 2]);
  });

  it('falls back to seat order so the list never reshuffles between renders', () => {
    const rows = [
      { id: 'c', name: 'Citra', score: 0, wins: 0, seat_index: 3 },
      { id: 'a', name: 'Andi', score: 0, wins: 0, seat_index: 1 },
      { id: 'b', name: 'Budi', score: 0, wins: 0, seat_index: 2 },
    ];
    expect(rankStandings(rows).map((row) => row.name)).toEqual(['Andi', 'Budi', 'Citra']);
    expect(rankStandings(rows).map((row) => row.rank)).toEqual([1, 1, 1]);
  });

  it('does not mutate the array it was given', () => {
    const rows = [
      { id: 'a', name: 'Andi', score: 1, wins: 1, seat_index: 1 },
      { id: 'b', name: 'Budi', score: 9, wins: 9, seat_index: 2 },
    ];
    rankStandings(rows);
    expect(rows[0]?.name).toBe('Andi');
  });

  it('handles an empty board', () => {
    expect(rankStandings([])).toEqual([]);
  });
});

describe('podiumOrder', () => {
  const board = rankStandings([
    { id: 'a', name: 'Andi', score: 9, wins: 9, seat_index: 1 },
    { id: 'b', name: 'Budi', score: 6, wins: 6, seat_index: 2 },
    { id: 'c', name: 'Citra', score: 3, wins: 3, seat_index: 3 },
    { id: 'd', name: 'Dimas', score: 1, wins: 1, seat_index: 4 },
  ]);

  it('puts 2nd left, 1st centre, 3rd right', () => {
    expect(podiumOrder(board).map((row) => row?.name)).toEqual(['Budi', 'Andi', 'Citra']);
  });

  it('leaves slots empty rather than promoting 4th place', () => {
    const small = rankStandings([
      { id: 'a', name: 'Andi', score: 2, wins: 2, seat_index: 1 },
      { id: 'b', name: 'Budi', score: 1, wins: 1, seat_index: 2 },
    ]);
    expect(podiumOrder(small).map((row) => row?.name ?? null)).toEqual(['Budi', 'Andi', null]);
  });

  it('shows only the centre plinth when everyone is tied at the top', () => {
    const tied = rankStandings([
      { id: 'a', name: 'Andi', score: 2, wins: 2, seat_index: 1 },
      { id: 'b', name: 'Budi', score: 2, wins: 2, seat_index: 2 },
    ]);
    // Both are rank 1, so there is no 2nd or 3rd to stand anywhere.
    expect(podiumOrder(tied).map((row) => row?.name ?? null)).toEqual([null, 'Andi', null]);
  });

  it('returns three empty slots for an empty board', () => {
    expect(podiumOrder([])).toEqual([null, null, null]);
  });
});
