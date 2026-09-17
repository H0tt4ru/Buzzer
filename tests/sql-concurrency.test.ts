import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The concurrency guarantees are properties of the database, not of this
 * codebase: "exactly one of eight simultaneous presses wins" is enforced by a
 * row lock and a unique constraint, and can only be tested by actually running
 * eight connections at one instant. So this suite delegates to
 * supabase/tests/concurrency.sh rather than mocking anything.
 *
 * It runs only when a database is configured, and skips cleanly otherwise so
 * `npm test` stays useful without one:
 *
 *   DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' npm test
 *
 * For a local Supabase stack that URL is what `supabase status` prints as
 * "DB URL". The script creates its own game and clears it afterwards.
 */
const DATABASE_URL = process.env.DATABASE_URL;
const PSQL = process.env.PSQL;
const configured = Boolean(DATABASE_URL ?? PSQL);

const SCRIPT = path.resolve(__dirname, '../supabase/tests/concurrency.sh');

describe.skipIf(!configured)('database concurrency guarantees', () => {
  it(
    'passes every server-side assertion',
    () => {
      let output = '';

      try {
        output = execFileSync('bash', [SCRIPT], {
          encoding: 'utf8',
          timeout: 180_000,
          env: process.env,
        });
      } catch (error) {
        const failure = error as { stdout?: string; stderr?: string };
        throw new Error(
          `concurrency.sh failed:\n${failure.stdout ?? ''}\n${failure.stderr ?? ''}`,
        );
      }

      // The script prints its own tally; assert on that rather than
      // re-counting, so a new assertion added to the script is covered here
      // without editing this file.
      expect(output).toMatch(/===== \d+ passed, 0 failed =====/);
      expect(output).toContain('PASS  exactly one winner among eight concurrent presses');
      expect(output).toContain('PASS  the previous winner is locked out of this round');
      expect(output).toContain('PASS  the original wins are still in the history');
    },
    200_000,
  );
});

describe.skipIf(configured)('database concurrency guarantees', () => {
  it('is skipped without a database, and says so', () => {
    // Deliberately a passing test rather than silence: `npm test` should make
    // it obvious that the SQL suite did not run.
    expect(configured).toBe(false);
    console.info(
      'Skipped the SQL suite. Set DATABASE_URL (or PSQL) to run supabase/tests/concurrency.sh.',
    );
  });
});
