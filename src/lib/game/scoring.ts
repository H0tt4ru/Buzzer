import type { GameSettings, LeaderboardRow } from '@/types/game';

/**
 * Scoring rules live here so that new ones can be added without touching the
 * buzzer path. Today there is a single rule — the round winner takes
 * `points_per_win` — but the shape is a list of rules applied to a round
 * result, so speed bonuses, streaks or per-difficulty points can be added by
 * appending to RULES and to the settings whitelist in SQL.
 */

export interface RoundResult {
  roundNumber: number;
  winnerStudentId: string;
  /** Milliseconds between activation and the winning press. */
  reactionMs: number | null;
}

export interface ScoreRule {
  id: string;
  /** Points contributed by this rule, or 0 if it does not apply. */
  points: (result: RoundResult, settings: GameSettings) => number;
}

export const WINNER_TAKES_POINTS: ScoreRule = {
  id: 'winner_takes_points',
  points: (_result, settings) => Math.max(0, settings.points_per_win),
};

export const RULES: ScoreRule[] = [WINNER_TAKES_POINTS];

/**
 * What a round is worth. The database applies `points_per_win` itself in
 * student_buzz/award_point (it must, to stay atomic); this mirror exists for
 * the UI preview and for tests, and stays in step because both read the same
 * setting.
 */
export function pointsForRound(result: RoundResult, settings: GameSettings): number {
  return RULES.reduce((total, rule) => total + rule.points(result, settings), 0);
}

/** Dense-ranked standings, highest score first, seat order breaking ties. */
export function rankStandings(
  rows: { id: string; name: string; score: number; wins: number; seat_index?: number }[],
): LeaderboardRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.score - a.score || b.wins - a.wins || (a.seat_index ?? 0) - (b.seat_index ?? 0),
  );

  let rank = 0;
  let previousScore: number | null = null;
  let previousWins: number | null = null;

  return sorted.map((row, index) => {
    if (row.score !== previousScore || row.wins !== previousWins) {
      rank = index + 1;
      previousScore = row.score;
      previousWins = row.wins;
    }
    return { ...row, rank };
  });
}

/** Podium slots in visual order: 2nd on the left, 1st raised in the middle. */
export function podiumOrder(board: LeaderboardRow[]): (LeaderboardRow | null)[] {
  const top = board.filter((row) => row.rank <= 3);
  const first = top.find((row) => row.rank === 1) ?? null;
  const second = top.find((row) => row.rank === 2) ?? null;
  const third = top.find((row) => row.rank === 3) ?? null;
  return [second, first, third];
}
