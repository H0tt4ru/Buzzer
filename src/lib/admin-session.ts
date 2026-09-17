'use client';

/**
 * The teacher has no account. Creating a game mints an admin token; it is kept
 * in localStorage on the device that created it, and can also be carried in a
 * `?t=` query parameter so the teacher can bookmark or move the dashboard to
 * another machine.
 */

const KEY = 'bel-kelas:games';

export interface StoredGame {
  gameId: string;
  adminToken: string;
  joinCode: string;
  studentCount: number;
  createdAt: string;
}

function read(): StoredGame[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredGame[]) : [];
  } catch {
    return [];
  }
}

function write(games: StoredGame[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(games.slice(0, 10)));
  } catch {
    // Private browsing with storage disabled: the ?t= link still works.
  }
}

export function listGames(): StoredGame[] {
  return read();
}

export function rememberGame(game: StoredGame): void {
  write([game, ...read().filter((g) => g.gameId !== game.gameId)]);
}

export function forgetGame(gameId: string): void {
  write(read().filter((g) => g.gameId !== gameId));
}

export function tokenFor(gameId: string): string | null {
  return read().find((g) => g.gameId === gameId)?.adminToken ?? null;
}
