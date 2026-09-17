-- ===========================================================================
-- 0003_student_api.sql — the functions a student's browser may call.
--
-- These are the only writable surface exposed to the anon key, and each one
-- takes the student's secret token as its credential. They are SECURITY
-- DEFINER, so RLS can stay fully closed on every table.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- server_now: the reference clock. Every device measures its offset against
-- this (round-trip halved, best-of-N) so that a local countdown can target the
-- server's `buzzer_open_at` instead of each device's own idea of "now".
-- clock_timestamp() rather than now() because now() is transaction start.
-- ---------------------------------------------------------------------------
create or replace function server_now()
returns timestamptz
language sql
stable
as $$ select clock_timestamp(); $$;

-- ---------------------------------------------------------------------------
-- Internal: resolve a token to a student, or null.
-- ---------------------------------------------------------------------------
create or replace function resolve_student(p_token text)
returns students
language sql
stable
security definer
set search_path = public
as $$
  select s.*
    from students s
    join student_tokens t on t.student_id = s.id
   where t.token = p_token;
$$;

-- ---------------------------------------------------------------------------
-- student_state: the authoritative snapshot a student renders from. Called on
-- mount, on every pulse change, on reconnect, on tab wake, and on a timer.
-- The leaderboard is only included when the teacher has turned it on — the
-- data never reaches the client otherwise, so it cannot be revealed by poking
-- at the browser.
-- ---------------------------------------------------------------------------
create or replace function student_state(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_student     students;
  v_game        games;
  v_round       rounds;
  v_pulse       game_pulse;
  v_my_buzz     buzzes;
  v_winner_name text;
  v_board       jsonb := null;
begin
  v_student := resolve_student(p_token);
  if v_student.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  select * into v_game  from games      where id = v_student.game_id;
  select * into v_pulse from game_pulse where game_id = v_student.game_id;

  if v_game.current_round_id is not null then
    select * into v_round from rounds where id = v_game.current_round_id;
    select id, game_id, round_id, student_id, buzz_window, pressed_at, accepted
      into v_my_buzz
      from buzzes
     where round_id = v_round.id
       and student_id = v_student.id
       and buzz_window = v_round.buzz_window;
  end if;

  if v_round.winner_student_id is not null then
    select display_name into v_winner_name from students where id = v_round.winner_student_id;
  end if;

  if coalesce((v_game.settings->>'student_leaderboard')::boolean, false) then
    select jsonb_agg(row_to_json(b)::jsonb order by b.rank)
      into v_board
      from (
        select s.id,
               s.display_name as name,
               coalesce(sc.score, 0) as score,
               coalesce(sc.wins, 0)  as wins,
               rank() over (order by coalesce(sc.score, 0) desc, s.seat_index) as rank
          from students s
          left join scores sc on sc.student_id = s.id
         where s.game_id = v_student.game_id
      ) b;
  end if;

  return jsonb_build_object(
    'ok', true,
    'server_time', clock_timestamp(),
    'student', jsonb_build_object(
      'id', v_student.id,
      'name', v_student.display_name,
      'is_ready', v_student.is_ready,
      'seat_index', v_student.seat_index
    ),
    'game', jsonb_build_object(
      'id', v_game.id,
      'status', v_game.status,
      'settings', jsonb_build_object(
        'countdown_seconds', v_game.settings->'countdown_seconds',
        'sound_enabled', v_game.settings->'sound_enabled',
        'require_all_ready', v_game.settings->'require_all_ready',
        'student_leaderboard', v_game.settings->'student_leaderboard'
      )
    ),
    'round', case when v_round.id is null then null else jsonb_build_object(
      'id', v_round.id,
      'number', v_round.round_number,
      'state', v_round.state,
      'buzz_window', v_round.buzz_window,
      'buzzer_open_at', v_round.buzzer_open_at,
      'winner_student_id', v_round.winner_student_id,
      'winner_name', v_winner_name,
      'excluded', v_student.id = any(v_round.excluded_student_ids)
    ) end,
    'my_buzz', case when v_my_buzz.id is null then null else jsonb_build_object(
      'id', v_my_buzz.id,
      'buzz_window', v_my_buzz.buzz_window,
      'accepted', v_my_buzz.accepted,
      'pressed_at', v_my_buzz.pressed_at
    ) end,
    'revision', coalesce(v_pulse.revision, 0),
    'counts', jsonb_build_object(
      'students', coalesce(v_pulse.student_count, 0),
      'ready', coalesce(v_pulse.ready_count, 0),
      'buzzed', coalesce(v_pulse.buzzed_count, 0)
    ),
    'leaderboard', v_board
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- student_sync: heartbeat + authoritative state in one round trip.
--
-- Presence (Realtime) gives instant join/leave signals; this heartbeat is the
-- backstop that catches a device whose socket died without a leave event (tab
-- suspended, phone asleep, Wi-Fi gone). A student counts as connected only
-- while their heartbeat is fresh, so simply having opened the page once is
-- never enough.
-- ---------------------------------------------------------------------------
create or replace function student_sync(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student students;
  v_was_connected boolean;
begin
  v_student := resolve_student(p_token);
  if v_student.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  v_was_connected := v_student.connected
                     and v_student.last_seen_at is not null
                     and v_student.last_seen_at > clock_timestamp() - interval '25 seconds';

  update students
     set last_seen_at = clock_timestamp(),
         connected = true
   where id = v_student.id;

  if not v_was_connected then
    perform log_event(v_student.game_id, 'student_connected', 'student', v_student.id);
  end if;

  return student_state(p_token);
end;
$$;

-- ---------------------------------------------------------------------------
-- student_offline: best-effort "I am leaving" on pagehide. Not trusted for
-- anything but the roster light; the stale-heartbeat reaper is the real check.
-- ---------------------------------------------------------------------------
create or replace function student_offline(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student students;
begin
  v_student := resolve_student(p_token);
  if v_student.id is null or not v_student.connected then
    return;
  end if;

  update students set connected = false where id = v_student.id;
  perform log_event(v_student.game_id, 'student_disconnected', 'student', v_student.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- student_set_ready
-- ---------------------------------------------------------------------------
create or replace function student_set_ready(p_token text, p_ready boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student students;
begin
  v_student := resolve_student(p_token);
  if v_student.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_token');
  end if;

  if v_student.is_ready <> p_ready then
    update students
       set is_ready = p_ready,
           ready_at = case when p_ready then clock_timestamp() else null end,
           last_seen_at = clock_timestamp(),
           connected = true
     where id = v_student.id;

    perform log_event(v_student.game_id,
                      case when p_ready then 'student_ready' else 'student_unready' end,
                      'student', v_student.id);
  end if;

  return student_state(p_token);
end;
$$;

-- ===========================================================================
-- student_buzz — THE critical function.
--
-- CONCURRENCY STRATEGY
-- --------------------
-- Three students pressing 2 ms apart arrive as three concurrent transactions.
-- Two independent mechanisms guarantee exactly one winner:
--
--   1. `select ... from rounds where id = ... for update`
--      Takes an exclusive row lock on the round. Under READ COMMITTED the
--      waiting transactions re-read the row at the newest committed version
--      once the lock is granted, so the second and third callers see
--      state = 'locked' and a winner already set. All validation below
--      therefore happens on fresh state, serialized per round.
--
--   2. `update rounds set winner_... where id = ... and winner_student_id is null`
--      A compare-and-set. Even if mechanism 1 were bypassed (a future code
--      path forgetting the lock, or a replica oddity), this UPDATE can only
--      succeed while the winner slot is empty; `found` tells us whether we
--      claimed it. Belt and braces, on purpose.
--
-- Duplicate taps are collapsed by the UNIQUE (round_id, student_id,
-- buzz_window) constraint on `buzzes`: the second insert hits ON CONFLICT DO
-- NOTHING and returns no id, so one student produces exactly one attempt per
-- buzzer window no matter how many times they hammer the button. The UI
-- disables itself instantly as well, but that is a nicety, not the guarantee.
--
-- Timing is validated against clock_timestamp() >= buzzer_open_at, so a device
-- with a fast clock or a tampered countdown cannot buzz early.
-- ===========================================================================
create or replace function student_buzz(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student   students;
  v_game      games;
  v_round     rounds;
  v_now       timestamptz := clock_timestamp();
  v_buzz_id   uuid;
  v_winner    text;
  v_points    int;
begin
  -- 1. The student must exist.
  v_student := resolve_student(p_token);
  if v_student.id is null then
    return jsonb_build_object('ok', false, 'result', 'invalid_token');
  end if;

  -- 2. ...and belong to a game that is running.
  select * into v_game from games where id = v_student.game_id;
  if not found then
    return jsonb_build_object('ok', false, 'result', 'rejected', 'reason', 'no_game');
  end if;

  -- 3./4. Game not ended, not paused.
  if v_game.status = 'ended' then
    return jsonb_build_object('ok', false, 'result', 'rejected', 'reason', 'game_ended');
  elsif v_game.status = 'paused' then
    return jsonb_build_object('ok', false, 'result', 'rejected', 'reason', 'game_paused');
  elsif v_game.status <> 'active' then
    return jsonb_build_object('ok', false, 'result', 'rejected', 'reason', 'game_not_started');
  end if;

  if v_game.current_round_id is null then
    return jsonb_build_object('ok', false, 'result', 'rejected', 'reason', 'no_round');
  end if;

  -- === serialization point (mechanism 1) ===
  select * into v_round from rounds where id = v_game.current_round_id for update;

  -- 5./6. The round must still be taking buzzes. 'locked' is allowed through
  -- so that late presses are recorded and answered with a truthful "too late"
  -- instead of a generic rejection.
  if v_round.state not in ('armed', 'locked') then
    return jsonb_build_object('ok', false, 'result', 'rejected', 'reason', 'buzzer_closed');
  end if;

  if v_round.buzzer_open_at is null or v_now < v_round.buzzer_open_at then
    return jsonb_build_object('ok', false, 'result', 'rejected', 'reason', 'too_early',
                              'buzzer_open_at', v_round.buzzer_open_at);
  end if;

  -- A student who has already had their turn in this round (buzzer reopened
  -- after a wrong answer) cannot win it again.
  if v_student.id = any(v_round.excluded_student_ids) then
    return jsonb_build_object('ok', false, 'result', 'rejected', 'reason', 'excluded');
  end if;

  -- 7. One attempt per student per window (mechanism: UNIQUE constraint).
  insert into buzzes (game_id, round_id, student_id, buzz_window, pressed_at)
  values (v_game.id, v_round.id, v_student.id, v_round.buzz_window, v_now)
  on conflict (round_id, student_id, buzz_window) do nothing
  returning id into v_buzz_id;

  if v_buzz_id is null then
    if v_round.winner_student_id = v_student.id then
      return jsonb_build_object('ok', true, 'result', 'won', 'duplicate', true,
                                'round_id', v_round.id, 'winner_name', v_student.display_name);
    end if;
    return jsonb_build_object('ok', true, 'result', 'duplicate',
                              'round_id', v_round.id);
  end if;

  -- 8. Claim the winner slot (mechanism 2).
  update rounds
     set winner_student_id = v_student.id,
         winner_buzz_id    = v_buzz_id,
         state             = 'locked',
         locked_at         = v_now
   where id = v_round.id
     and winner_student_id is null;

  if not found then
    -- Somebody else already holds it: this press is a valid, recorded, losing
    -- attempt.
    select display_name into v_winner from students where id = v_round.winner_student_id;
    perform log_event(v_game.id, 'student_buzzed', 'student', v_student.id, v_round.round_number,
                      jsonb_build_object('outcome', 'too_late'));
    return jsonb_build_object('ok', true, 'result', 'too_late',
                              'round_id', v_round.id,
                              'winner_name', v_winner);
  end if;

  update buzzes set accepted = true where id = v_buzz_id;

  perform log_event(v_game.id, 'student_buzzed', 'student', v_student.id, v_round.round_number,
                    jsonb_build_object('outcome', 'first'));
  perform log_event(v_game.id, 'winner_determined', 'system', v_student.id, v_round.round_number,
                    jsonb_build_object('buzz_window', v_round.buzz_window));

  -- Scoring is configurable: award immediately, or wait for the teacher to
  -- confirm that the spoken answer was correct.
  if coalesce(v_game.settings->>'award_mode', 'auto') = 'auto' then
    v_points := coalesce((v_game.settings->>'points_per_win')::int, 1);

    insert into scores (game_id, student_id, score, wins, updated_at)
    values (v_game.id, v_student.id, v_points, 1, clock_timestamp())
    on conflict (game_id, student_id) do update
      set score = scores.score + v_points,
          wins  = scores.wins + 1,
          updated_at = clock_timestamp();

    update rounds
       set points_awarded = true,
           awarded_points = v_points
     where id = v_round.id;

    perform log_event(v_game.id, 'points_awarded', 'system', v_student.id, v_round.round_number,
                      jsonb_build_object('points', v_points));
  end if;

  return jsonb_build_object('ok', true, 'result', 'won',
                            'round_id', v_round.id,
                            'winner_name', v_student.display_name);
end;
$$;
