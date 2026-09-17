-- ===========================================================================
-- 0002_internals.sql — token generation, event logging, pulse maintenance.
-- Nothing in here is callable by the browser.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- gen_token: URL-safe, unambiguous alphabet (no 0/1/i/l/o to avoid transcription
-- mistakes when a teacher reads a link out loud). 16 chars over a 31-char
-- alphabet is ~79 bits of entropy, so student links are not guessable.
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

create or replace function gen_token(n int default 16)
returns text
language sql
volatile
as $$
  select string_agg(
           substr('abcdefghjkmnpqrstuvwxyz23456789',
                  (get_byte(b.bytes, i) % 31) + 1, 1),
           '' order by i)
  from (select extensions.gen_random_bytes(n) as bytes) b,
       generate_series(0, n - 1) as i;
$$;

-- ---------------------------------------------------------------------------
-- log_event: the only way history is written. Snapshots the student's name so
-- the history stays readable even if the roster is later renamed.
-- ---------------------------------------------------------------------------
create or replace function log_event(
  p_game_id      uuid,
  p_type         text,
  p_actor        text default 'system',
  p_student_id   uuid default null,
  p_round_number int default null,
  p_payload      jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if p_student_id is not null then
    select display_name into v_name from students where id = p_student_id;
  end if;

  insert into game_events (game_id, type, actor, student_id, student_name, round_number, payload)
  values (p_game_id, p_type, p_actor, p_student_id, v_name, p_round_number, coalesce(p_payload, '{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- refresh_game_pulse: recompute the broadcast row from the authoritative
-- tables. Cheap (a handful of indexed reads) and idempotent.
-- ---------------------------------------------------------------------------
create or replace function refresh_game_pulse(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game    games;
  v_round   rounds;
  v_winner  text;
  v_students int := 0;
  v_ready    int := 0;
  v_buzzed   int := 0;
begin
  select * into v_game from games where id = p_game_id;
  if not found then
    delete from game_pulse where game_id = p_game_id;
    return;
  end if;

  if v_game.current_round_id is not null then
    select * into v_round from rounds where id = v_game.current_round_id;
  end if;

  if v_round.winner_student_id is not null then
    select display_name into v_winner from students where id = v_round.winner_student_id;
  end if;

  select count(*), count(*) filter (where is_ready and connected)
    into v_students, v_ready
    from students where game_id = p_game_id;

  if v_round.id is not null then
    select count(*) into v_buzzed
      from buzzes
     where round_id = v_round.id and buzz_window = v_round.buzz_window;
  end if;

  insert into game_pulse as p (
    game_id, revision, status, current_round_number, round_id, round_state,
    buzz_window, buzzer_open_at, winner_student_id, winner_name,
    student_count, ready_count, buzzed_count, settings, updated_at
  )
  values (
    p_game_id, 1, v_game.status, v_game.current_round_number, v_round.id, v_round.state,
    coalesce(v_round.buzz_window, 0), v_round.buzzer_open_at, v_round.winner_student_id, v_winner,
    v_students, v_ready, v_buzzed, v_game.settings, clock_timestamp()
  )
  on conflict (game_id) do update set
    revision             = p.revision + 1,
    status               = excluded.status,
    current_round_number = excluded.current_round_number,
    round_id             = excluded.round_id,
    round_state          = excluded.round_state,
    buzz_window          = excluded.buzz_window,
    buzzer_open_at       = excluded.buzzer_open_at,
    winner_student_id    = excluded.winner_student_id,
    winner_name          = excluded.winner_name,
    student_count        = excluded.student_count,
    ready_count          = excluded.ready_count,
    buzzed_count         = excluded.buzzed_count,
    settings             = excluded.settings,
    updated_at           = excluded.updated_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers. Attaching the refresh to the tables (rather than calling it from
-- each RPC) means a new code path physically cannot forget to publish state.
-- ---------------------------------------------------------------------------
create or replace function tg_pulse_from_game()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform refresh_game_pulse(new.id);
  return null;
end;
$$;

create or replace function tg_pulse_from_child()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform refresh_game_pulse(new.game_id);
  return null;
end;
$$;

create trigger games_pulse_aiu
  after insert or update on games
  for each row execute function tg_pulse_from_game();

create trigger rounds_pulse_aiu
  after insert or update on rounds
  for each row execute function tg_pulse_from_child();

create trigger buzzes_pulse_ai
  after insert or update on buzzes
  for each row execute function tg_pulse_from_child();

-- Roster changes move the "x / y ready" and "y connected" counters.
create trigger students_pulse_aiu
  after insert or update of is_ready, connected, display_name on students
  for each row execute function tg_pulse_from_child();
