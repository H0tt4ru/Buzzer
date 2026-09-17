-- ===========================================================================
-- 0001_schema.sql — tables, indexes, and the single realtime "pulse" row.
--
-- Design notes
-- ------------
-- * The database is the ONLY authority on game state. Clients never decide who
--   won, when the buzzer opens, or whether a buzz is valid.
-- * `game_pulse` is the one table readable by the browser (anon key). It holds
--   a compact, non-sensitive projection of game state and is the single
--   Postgres-Changes subscription used by both the teacher and every student.
--   One UPDATE => one realtime message => everybody transitions together.
--   Scores, tokens, rosters and event history are deliberately NOT in there;
--   they are fetched through functions/routes that check a credential, which
--   is what keeps the live leaderboard hidden from students when disabled.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums: an explicit state model instead of a pile of booleans.
-- The client-facing phase (WAITING / READY_CHECK / COUNTDOWN / BUZZER_ACTIVE /
-- ROUND_COMPLETE / PAUSED / GAME_OVER) is derived from these two columns plus
-- the server clock. See src/lib/game/phase.ts — one function, one truth.
-- ---------------------------------------------------------------------------
create type game_status as enum ('lobby', 'active', 'paused', 'ended');
create type round_state as enum ('pending', 'armed', 'locked', 'complete');

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------
create table games (
  id                   uuid primary key default gen_random_uuid(),
  join_code            text not null unique,
  admin_token          text not null unique,
  status               game_status not null default 'lobby',
  current_round_id     uuid,
  current_round_number int not null default 0,
  settings             jsonb not null default jsonb_build_object(
                         'points_per_win', 1,
                         'buzzer_mode', 'manual',       -- 'manual' | 'auto'
                         'countdown_seconds', 3,        -- 0 | 3 | 5
                         'sound_enabled', true,
                         'live_leaderboard', true,      -- visible to the teacher
                         'student_leaderboard', false,  -- visible to students
                         'require_all_ready', false,
                         'award_mode', 'auto',          -- 'auto' | 'manual'
                         'exclude_previous_on_reopen', true
                       ),
  created_at           timestamptz not null default now(),
  started_at           timestamptz,
  ended_at             timestamptz
);

-- ---------------------------------------------------------------------------
-- students — no accounts, no passwords. A row plus a secret token is identity.
-- Nothing in here is secret, so this table is safe to read by name lookups
-- inside SECURITY DEFINER functions.
-- ---------------------------------------------------------------------------
create table students (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games(id) on delete cascade,
  seat_index    int not null,
  display_name  text not null check (length(btrim(display_name)) between 1 and 40),
  is_ready      boolean not null default false,
  ready_at      timestamptz,
  connected     boolean not null default false,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (game_id, seat_index)
);
create index students_game_idx on students (game_id, seat_index);

-- ---------------------------------------------------------------------------
-- student_tokens — kept in a separate table so that the token never travels
-- with roster data and can never be leaked by a roster query. No role other
-- than service_role (and SECURITY DEFINER functions) can read it.
-- ---------------------------------------------------------------------------
create table student_tokens (
  student_id uuid primary key references students(id) on delete cascade,
  game_id    uuid not null references games(id) on delete cascade,
  token      text not null unique
);

-- ---------------------------------------------------------------------------
-- rounds
--
-- `buzz_window` is the concurrency generation counter for a round. Reopening
-- the buzzer after a wrong answer bumps it, which (a) lets a student buzz
-- again in the same round without colliding with their earlier attempt, and
-- (b) makes every in-flight request from the previous window unambiguously
-- stale. `buzzer_open_at` is the server-authoritative activation instant that
-- every device counts down to.
-- ---------------------------------------------------------------------------
create table rounds (
  id                   uuid primary key default gen_random_uuid(),
  game_id              uuid not null references games(id) on delete cascade,
  round_number         int not null,
  state                round_state not null default 'pending',
  buzz_window          int not null default 0,
  buzzer_open_at       timestamptz,
  winner_student_id    uuid references students(id) on delete set null,
  winner_buzz_id       uuid,
  points_awarded       boolean not null default false,
  awarded_points       int not null default 0,
  excluded_student_ids uuid[] not null default '{}',
  started_at           timestamptz not null default now(),
  locked_at            timestamptz,
  ended_at             timestamptz,
  unique (game_id, round_number)
);
create index rounds_game_idx on rounds (game_id, round_number desc);

alter table games
  add constraint games_current_round_fkey
  foreign key (current_round_id) references rounds(id) on delete set null;

-- ---------------------------------------------------------------------------
-- buzzes — every accepted attempt, one row. The UNIQUE constraint is what
-- makes repeated taps from one student in one window a single attempt at the
-- database level, not just in the UI.
-- ---------------------------------------------------------------------------
create table buzzes (
  id          uuid primary key default gen_random_uuid(),
  game_id     uuid not null references games(id) on delete cascade,
  round_id    uuid not null references rounds(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  buzz_window int not null,
  pressed_at  timestamptz not null default clock_timestamp(),
  accepted    boolean not null default false,
  unique (round_id, student_id, buzz_window)
);
create index buzzes_round_idx on buzzes (round_id, buzz_window, pressed_at);

alter table rounds
  add constraint rounds_winner_buzz_fkey
  foreign key (winner_buzz_id) references buzzes(id) on delete set null;

-- ---------------------------------------------------------------------------
-- scores — one row per student per game. Only ever written by the scoring
-- functions, so a student cannot inflate their own total.
-- ---------------------------------------------------------------------------
create table scores (
  game_id    uuid not null references games(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  score      int not null default 0,
  wins       int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (game_id, student_id)
);

-- ---------------------------------------------------------------------------
-- game_events — append-only history. Corrections are new rows (for example
-- `winner_undone`), never edits or deletes of old rows. Enforced by privilege:
-- no role is granted UPDATE or DELETE on this table.
-- `type` stays in English; the UI renders Indonesian from type + payload.
-- ---------------------------------------------------------------------------
create table game_events (
  id           bigserial primary key,
  game_id      uuid not null references games(id) on delete cascade,
  type         text not null,
  actor        text not null default 'system' check (actor in ('system', 'teacher', 'student')),
  student_id   uuid references students(id) on delete set null,
  student_name text,
  round_number int,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default clock_timestamp()
);
create index game_events_game_idx on game_events (game_id, id desc);

-- ---------------------------------------------------------------------------
-- game_pulse — the realtime broadcast row (see header). Exactly one row per
-- game, maintained by triggers so no code path can forget to publish.
-- `revision` increments on every change, which gives clients a cheap way to
-- detect that they have missed something and must re-sync.
-- ---------------------------------------------------------------------------
create table game_pulse (
  game_id              uuid primary key references games(id) on delete cascade,
  revision             bigint not null default 1,
  status               game_status not null,
  current_round_number int not null default 0,
  round_id             uuid,
  round_state          round_state,
  buzz_window          int not null default 0,
  buzzer_open_at       timestamptz,
  winner_student_id    uuid,
  winner_name          text,
  student_count        int not null default 0,
  ready_count          int not null default 0,
  buzzed_count         int not null default 0,
  settings             jsonb not null default '{}'::jsonb,
  updated_at           timestamptz not null default clock_timestamp()
);
