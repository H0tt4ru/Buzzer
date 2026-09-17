# Bel Kelas — real-time classroom buzzer

A quiz-show buzzer for a classroom. The teacher opens a dashboard, hands each
student a private link, and the first student to press wins the round. The
interface is entirely in Indonesian; the code, database and comments are in
English.

Built with Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS,
shadcn/ui-style primitives, Supabase (PostgreSQL + Realtime), and nothing else
— no persistent backend process, so it deploys to Vercel as-is.

---

## Table of contents

1. [How it plays](#how-it-plays)
2. [Setup](#setup)
3. [Deploying to Vercel](#deploying-to-vercel)
4. [Architecture](#architecture)
5. [Concurrency: how one winner is guaranteed](#concurrency-how-one-winner-is-guaranteed)
6. [Clock synchronisation](#clock-synchronisation)
7. [Security model](#security-model)
8. [Settings](#settings)
9. [Testing](#testing)
10. [Project layout](#project-layout)

---

## How it plays

1. The teacher opens `/admin`, pastes a class list (one name per line), and
   creates a game. No account, no login.
2. The **Tautan** tab gives one secret link per student
   (`/play/<16-char token>`). Copy them individually, or copy the whole list as
   name-and-link pairs to paste into a chat.
3. Students open their link. They see their name, a connection indicator, and
   (optionally) a **Saya siap** button.
4. The teacher presses **Ronde berikutnya**, then **Aktifkan buzzer**. Every
   device counts down to the same instant and the buzzer goes live together.
5. The first valid press wins. The winner's name slams onto the dashboard;
   everyone else sees *Terlambat*.
6. The teacher then either:
   - awards the point and moves on (**Ronde berikutnya**),
   - **Buka buzzer lagi** — the answer was wrong, so that student loses their
     turn in this round and the buzzer reopens for everyone else, or
   - **Batalkan pemenang** — the win itself was a mistake; the point is taken
     back and the round resets, with the original events kept in the history.
7. Rounds are unlimited. **Akhiri permainan** shows an animated podium and the
   full scoreboard. **Hapus permainan** deletes everything, with a confirmation
   checkbox.

---

## Setup

### 1. Create a Supabase project

Any region; the free tier is fine for a classroom.

### 2. Apply the migrations

In order. Either paste each file into the Supabase SQL editor, or use the CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push          # applies everything in supabase/migrations
```

Or directly with `psql`:

```bash
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

| File | What it creates |
| --- | --- |
| `0001_schema.sql` | Enums, eight tables, foreign keys, indexes |
| `0002_internals.sql` | Token generation, event log, the `game_pulse` projection and its triggers |
| `0003_student_api.sql` | The six functions a student's browser may call |
| `0004_admin_api.sql` | The fifteen teacher functions |
| `0005_rls_and_grants.sql` | RLS on every table, `revoke`/`grant` per function, Realtime publication |

`0005` is not optional. Until it runs, the anon key can read more than it
should.

### 3. Enable Realtime

`0005_rls_and_grants.sql` adds `game_pulse` to the `supabase_realtime`
publication. Confirm under **Database → Replication** that `game_pulse` is
listed. It is the only table that needs it.

### 4. Environment

```bash
cp .env.example .env.local
```

| Variable | Where it comes from | Exposed to browser |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API | **no** |
| `NEXT_PUBLIC_SITE_URL` | your own domain, no trailing slash | yes |

The anon key being public is by design — see
[Security model](#security-model). The service role key must never carry a
`NEXT_PUBLIC_` prefix; it is read only inside `src/app/api/**`.

### 5. Run

```bash
npm install
npm run dev
```

---

## Deploying to Vercel

1. Push the repository to GitHub, then **Add New → Project** in Vercel and
   import it. The framework preset is detected automatically; no build
   settings need changing.
2. Add the four environment variables above under **Settings → Environment
   Variables**, for Production and Preview. Set `NEXT_PUBLIC_SITE_URL` to the
   deployment's own URL so copied student links point at the right host.
3. Deploy. There is no server to keep running: the pages are static or
   on-demand, and the four route handlers under `/api` are serverless
   functions.
4. Add the deployment URL to **Authentication → URL Configuration** in
   Supabase if you later add auth. For this app it is not required.

Vercel's default Node runtime is used, and no route needs the Edge runtime —
`/api/time` reads the database clock, which is the whole point of it.

---

## Architecture

```
Teacher browser                          Student browser (×30)
      │                                          │
      │ fetch  /api/games/[id]/actions           │ supabase-js rpc()
      │        x-admin-token header              │ student token in the call
      ▼                                          ▼
 Route handler (service role)  ────────►  PostgreSQL  ◄──── student_buzz()
      ▲                                     │    │
      │ admin_snapshot()                    │    │ AFTER triggers
      │                                     │    ▼
      │                                     │  game_pulse (one row per game)
      │                                     │    │
      └─────────── Realtime ◄───────────────┴────┘
                   (both sides subscribe)
```

### One realtime surface

Every client subscribes to exactly one row: that game's `game_pulse`. It holds
the non-sensitive projected state — status, round state, `buzzer_open_at`, the
winner's name, three counts, the settings, and a monotonic `revision`.

It is maintained by `AFTER` triggers on `games`, `rounds`, `buzzes` and
`students`, so no code path can forget to publish. One `UPDATE` becomes one
realtime message, and all thirty devices transition on the same message rather
than on thirty separate queries.

What is deliberately *not* in it: scores, tokens, the roster, the event
history. That omission is what hides the leaderboard from students when
`student_leaderboard` is off — the data never leaves the database rather than
being filtered in the client.

### The state model

Postgres stores two orthogonal facts plus one timestamp: `games.status`,
`rounds.state`, and `rounds.buzzer_open_at`. Every phase the UI can be in is a
pure function of those three (`src/lib/game/phase.ts`):

| Condition | Phase |
| --- | --- |
| `status = 'ended'` | `GAME_OVER` |
| `status = 'paused'` | `PAUSED` |
| no round, or `state = 'pending'` | `WAITING` / `READY_CHECK` |
| `state = 'armed'`, now < `buzzer_open_at` | `COUNTDOWN` |
| `state = 'armed'`, now ≥ `buzzer_open_at` | `BUZZER_ACTIVE` |
| `state = 'locked'` or `'complete'` | `ROUND_COMPLETE` |

The ordering is load-bearing: a paused game reports `PAUSED` even if its round
is armed, so "paused but the buzzer is somehow live" is not a representable
state. There are no loose booleans anywhere in the UI.

### Two data paths, on purpose

Students call the database **directly** through `supabase-js`. A buzzer press
is one round trip to Postgres, with no Next.js function in the middle — the
lowest latency available, which matters when the margin between first and
second place is tens of milliseconds.

Teacher actions go through `/api/games/[gameId]/actions`, because the teacher's
functions are granted to `service_role` only and that key cannot be in a
browser. The dashboard also can't read the roster or scores with the anon key,
so it re-fetches `admin_snapshot()` whenever the pulse revision moves.

---

## Concurrency: how one winner is guaranteed

Thirty students press within the same 50 ms. Exactly one must win, and every
other press must get a truthful answer. Two independent mechanisms in
`student_buzz()` (see `0003_student_api.sql`):

**1. A row lock serialises the round.**

```sql
select * into v_round from rounds where id = v_round_id for update;
```

Under `READ COMMITTED`, a transaction that blocks here re-reads the newest
committed version of the row when the lock is released. So the second presser
does not evaluate a stale "winner is null" — it sees the first presser's
committed win.

**2. A compare-and-set writes the winner.**

```sql
update rounds
   set winner_student_id = v_student_id, ...
 where id = v_round_id
   and winner_student_id is null;   -- ← only if still unclaimed
```

Even if the lock were somehow bypassed, this `UPDATE` affects zero rows for
everyone after the first. The function checks the affected row count to decide
between `won` and `too_late`; it never infers the outcome from a prior `SELECT`.

**Duplicate taps** are collapsed by a unique constraint rather than by
application logic:

```sql
unique (round_id, student_id, buzz_window)
```

with `on conflict do nothing`. A double tap 5 ms apart produces one row. The
client also holds a synchronous ref-based guard so the second tap never leaves
the device, but the constraint is the guarantee.

**Timing** is validated server-side as `clock_timestamp() >= buzzer_open_at`.
A device with a skewed clock, a modified client, or a replayed request cannot
buzz early.

**Late presses are recorded, not discarded.** `state = 'locked'` is allowed
through the function so the press gets a row and an honest `too_late` reply.
Silently dropping it would leave the student staring at an unresponsive button.

### `buzz_window`

`rounds.buzz_window` is a generation counter, incremented by `reopen_buzzer()`.
It does two jobs: it lets a student buzz again in the same round after a
reopen (the unique constraint includes it), and it makes every in-flight
request from the previous window unambiguously stale. A press that arrives
citing window 0 after the reopen to window 1 is rejected as a duplicate rather
than being mistaken for a fresh attempt.

### Activation grace

`activation_grace()` adds 400 ms to every activation timestamp. Without it, the
student whose network path is shortest receives the realtime message first and
can legally press before the message has reached the rest of the class.
Fairness is worth 400 ms.

### Resume re-arms

If a round was armed when the teacher paused, `resume_game()` re-arms it with a
fresh countdown of at least one second rather than restoring the old
timestamp. A student holding their finger on the button through a pause gains
nothing. Pause is game-level, so resume can never accidentally start a round.

---

## Clock synchronisation

**The teacher's "Aktifkan buzzer" does not tell devices to start a timer.** It
writes a server timestamp that every device counts down *to*. No `setTimeout`
decides when a buzzer opens.

Each device measures its offset from the database clock with a miniature NTP
(`src/hooks/useServerClock.ts`):

1. `t0 = Date.now()`, call `server_now()`, `t1 = Date.now()` on reply.
2. Assuming symmetric legs, the server's reading corresponds to local
   `(t0 + t1) / 2`, so `offset = serverMs - (t0 + t1) / 2`.
3. Take five samples and keep the one with the **smallest** round trip. The
   least-delayed sample is the least distorted; a mean would let one slow
   request skew everything.

`serverNow()` is then `Date.now() + offset`. Resynced every 60 s, and again on
`visibilitychange` and `online`, because a suspended tab can wake with a jumped
clock. If the RPC is unreachable, `/api/time` returns the same database clock
over plain HTTPS.

None of this is trusted for correctness — the database independently refuses
any press arriving before `buzzer_open_at`. The sync exists so that thirty
countdowns hit zero at the same moment.

---

## Security model

Students have no accounts. A 16-character token from a 31-symbol
unambiguous alphabet (no `0`/`1`/`i`/`l`/`o`) is a student's entire identity —
about 79 bits, not guessable by a bored teenager with a browser. Admin tokens
are 24 characters.

- **RLS is enabled on all eight tables, with no policies at all** except
  `game_pulse`, which has a single read policy. No policy means no access:
  the anon key cannot select from `students`, `scores`, `buzzes` or
  `game_events` even with a valid game id.
- **Every mutation is a `SECURITY DEFINER` function that demands a credential.**
  `EXECUTE` is revoked from `public`, `anon` and `authenticated`, then granted
  back selectively: six student functions to `anon`, fifteen teacher functions
  to `service_role` only.
- **Student tokens live in a separate table** (`student_tokens`). Roster
  queries cannot leak them by accident; only `admin_snapshot()` joins them in.
- **All validation is server-side.** The client's `canBuzz()` gate exists so
  the UI does not lie to a student about a button that would fail — not as
  security. Every one of the checks below is enforced in SQL regardless of
  what the client sends:

  1. the token resolves to a student in this game
  2. the game is `active` (not lobby, paused or ended)
  3. a current round exists
  4. the round is `armed` or `locked` (not `pending`/`complete`)
  5. `clock_timestamp() >= buzzer_open_at`
  6. the student is not in `excluded_student_ids`
  7. no accepted buzz exists for this `(round, student, buzz_window)`
  8. the winner slot is still null, checked as a compare-and-set

- **The service role key never reaches the browser.** The route handlers check
  the `x-admin-token` header first, and `/state` additionally refuses a token
  belonging to a different game than the URL names.

---

## Settings

All under **Pengaturan** on the dashboard, applied live.

| Setting | Default | Effect |
| --- | --- | --- |
| `points_per_win` | 1 | Points for winning a round |
| `buzzer_mode` | `manual` | `auto` arms the buzzer as soon as a round starts |
| `countdown_seconds` | 3 | 0, 3 or 5 |
| `sound_enabled` | true | Game-wide sound |
| `live_leaderboard` | true | Standings on the teacher's dashboard |
| `student_leaderboard` | false | Whether students receive standings at all |
| `require_all_ready` | false | A round refuses to start until everyone has pressed *Saya siap* |
| `award_mode` | `auto` | `manual` holds the point until the teacher approves the answer |
| `exclude_previous_on_reopen` | true | Whether a reopen locks out the student who just answered |

Writes are whitelisted twice: the panel sends only the keys it touched, and
`sanitize_settings()` in SQL drops anything not on its list. Adding a setting
means editing that whitelist, `src/lib/game/settings.ts` and the column
default — nothing in the buzzer path changes.

Scoring rules are a list in `src/lib/game/scoring.ts`, so speed bonuses or
streaks can be added without touching the press path.

---

## Testing

```bash
npm run typecheck   # tsc --noEmit, strict + noUncheckedIndexedAccess
npm run build       # production build
npm test            # vitest
```

The unit suite covers the phase machine, the buzz gate, scoring and ranking,
the Indonesian event descriptions (including that every event type the
database can write has a description), and the name parser.

The concurrency guarantees are tested against a **real** PostgreSQL, because
they are properties of row locks and unique constraints — a mock would only be
asserting that the mock behaves as written. `supabase/tests/concurrency.sh`
opens eight separate connections, spins them to a shared wall-clock instant,
and checks 39 assertions covering all eight validations above plus reopen,
undo, pause, the readiness gate, leaderboard visibility, and that
`clear_game` cascades.

```bash
# runs automatically as part of npm test when a database is configured
DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' npm test

# or standalone
PSQL='psql -h /tmp -p 5433 -U postgres -d buzzer' ./supabase/tests/concurrency.sh
```

Without a database the SQL suite skips and says so rather than passing
silently. The script creates its own game and clears it afterwards, so it is
safe against a database holding other games.

---

## Project layout

```
src/
├── app/
│   ├── layout.tsx                    fonts, Toaster, viewport
│   ├── page.tsx                      landing
│   ├── admin/page.tsx                create a game / resume a saved one
│   ├── admin/[gameId]/page.tsx       dashboard (reads ?t= admin token)
│   ├── play/[token]/page.tsx         the student's screen
│   └── api/
│       ├── games/route.ts                       POST create_game
│       ├── games/[gameId]/state/route.ts        GET  admin_snapshot
│       ├── games/[gameId]/actions/route.ts      POST every teacher action
│       └── time/route.ts                        GET  database clock
├── components/
│   ├── admin/      dashboard, controls, roster, links, settings, history, results
│   ├── student/    BuzzerButton, StudentGame
│   ├── shared/     Confetti, ConnectionIndicator, Countdown, Podium
│   └── ui/         button, card, dialog, tabs, table, switch, …
├── hooks/
│   ├── useServerClock.ts    clock sync
│   ├── useGamePulse.ts      realtime subscription + connection state
│   ├── useStudentGame.ts    student state machine
│   └── useAdminGame.ts      teacher state machine
├── lib/
│   ├── game/       phase, scoring, settings, events
│   ├── supabase/   browser client (anon), server client (service role)
│   ├── i18n.ts     every user-facing string, in Indonesian
│   ├── sound.ts    WebAudio cues, no audio files
│   └── utils.ts
└── types/game.ts   the database contract as TypeScript

supabase/
├── migrations/     0001 … 0005, applied in order
└── tests/          concurrency.sh
```

### Notes on a few choices

**No animation library.** The animations are Tailwind keyframes and one
hand-rolled canvas confetti (~60 lines) that cancels its own animation frame.
A long game does not accumulate `requestAnimationFrame` loops behind the
dashboard, and there is no bundle cost. `prefers-reduced-motion` stops the
decorative loops while keeping state changes briefly animated, so it stays
clear what happened.

**No audio files.** Every cue is synthesised with WebAudio, so there is nothing
to load and nothing to 404. Playback is fire-and-forget and never throws:
sound can never delay or block a buzzer press. Audio unlocks on the first
interaction, per browser autoplay rules.

**The buzzer fires on `pointerdown`, not `click`.** A `click` waits for the
release. On a touch device that is tens of milliseconds of nothing, which is
the entire margin of victory.

**Subscriptions are cleaned up.** Every `useEffect` that subscribes returns a
teardown that calls `removeChannel`, and the confetti, countdown and clock
timers all clear their intervals.
