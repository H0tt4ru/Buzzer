-- ===========================================================================
-- 0004_admin_api.sql — teacher-only functions.
--
-- These are never granted to the anon key. The Next.js route handlers call
-- them with the service role key after checking the `x-admin-token` header,
-- so the admin credential never has to be trusted to the browser's database
-- connection and these functions cannot even be attempted from a student's
-- device.
--
-- Every function takes the admin token and re-validates it, so authorization
-- lives next to the data rather than only in the route layer.
-- ===========================================================================

-- Added to every buzzer activation. Gives the realtime message a moment to
-- reach all devices before the window legally opens, so the student with the
-- shortest network path does not win by latency alone.
create or replace function activation_grace()
returns interval language sql immutable as $$ select interval '400 milliseconds'; $$;

create or replace function resolve_game(p_admin_token text)
returns games
language sql
stable
security definer
set search_path = public
as $$ select * from games where admin_token = p_admin_token; $$;

-- ---------------------------------------------------------------------------
-- sanitize_settings — whitelist. Anything unknown is dropped so a stray key
-- can never end up in the settings blob that the pulse row publishes.
-- ---------------------------------------------------------------------------
create or replace function sanitize_settings(p_settings jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_countdown int;
  v_points int;
begin
  if p_settings is null then return v_out; end if;

  if p_settings ? 'points_per_win' then
    v_points := greatest(0, least(100, (p_settings->>'points_per_win')::int));
    v_out := v_out || jsonb_build_object('points_per_win', v_points);
  end if;

  if p_settings ? 'buzzer_mode' and p_settings->>'buzzer_mode' in ('manual', 'auto') then
    v_out := v_out || jsonb_build_object('buzzer_mode', p_settings->>'buzzer_mode');
  end if;

  if p_settings ? 'countdown_seconds' then
    v_countdown := (p_settings->>'countdown_seconds')::int;
    if v_countdown in (0, 3, 5) then
      v_out := v_out || jsonb_build_object('countdown_seconds', v_countdown);
    end if;
  end if;

  if p_settings ? 'award_mode' and p_settings->>'award_mode' in ('auto', 'manual') then
    v_out := v_out || jsonb_build_object('award_mode', p_settings->>'award_mode');
  end if;

  if p_settings ? 'sound_enabled' then
    v_out := v_out || jsonb_build_object('sound_enabled', (p_settings->>'sound_enabled')::boolean);
  end if;
  if p_settings ? 'live_leaderboard' then
    v_out := v_out || jsonb_build_object('live_leaderboard', (p_settings->>'live_leaderboard')::boolean);
  end if;
  if p_settings ? 'student_leaderboard' then
    v_out := v_out || jsonb_build_object('student_leaderboard', (p_settings->>'student_leaderboard')::boolean);
  end if;
  if p_settings ? 'require_all_ready' then
    v_out := v_out || jsonb_build_object('require_all_ready', (p_settings->>'require_all_ready')::boolean);
  end if;
  if p_settings ? 'exclude_previous_on_reopen' then
    v_out := v_out || jsonb_build_object('exclude_previous_on_reopen', (p_settings->>'exclude_previous_on_reopen')::boolean);
  end if;

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_game — names may be supplied ("Andi", "Budi", ...) or left to the
-- default "Siswa n" placeholders when the teacher only wants n links.
-- ---------------------------------------------------------------------------
create or replace function create_game(p_names text[], p_settings jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games;
  v_name text;
  v_idx  int := 0;
  v_students jsonb := '[]'::jsonb;
  v_student_id uuid;
  v_token text;
begin
  if p_names is null or array_length(p_names, 1) is null then
    raise exception 'no_students' using errcode = 'check_violation';
  end if;
  if array_length(p_names, 1) > 200 then
    raise exception 'too_many_students' using errcode = 'check_violation';
  end if;

  insert into games (join_code, admin_token)
  values (upper(gen_token(6)), gen_token(24))
  returning * into v_game;

  update games
     set settings = settings || sanitize_settings(p_settings)
   where id = v_game.id
  returning * into v_game;

  perform log_event(v_game.id, 'game_created', 'teacher');

  foreach v_name in array p_names loop
    v_idx := v_idx + 1;
    v_token := gen_token(16);

    insert into students (game_id, seat_index, display_name)
    values (v_game.id, v_idx, coalesce(nullif(btrim(v_name), ''), 'Siswa ' || v_idx))
    returning id into v_student_id;

    insert into student_tokens (student_id, game_id, token)
    values (v_student_id, v_game.id, v_token);

    insert into scores (game_id, student_id) values (v_game.id, v_student_id);

    perform log_event(v_game.id, 'student_link_created', 'teacher', v_student_id);

    v_students := v_students || jsonb_build_array(jsonb_build_object(
      'id', v_student_id, 'seat_index', v_idx,
      'name', coalesce(nullif(btrim(v_name), ''), 'Siswa ' || v_idx),
      'token', v_token));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'game_id', v_game.id,
    'join_code', v_game.join_code,
    'admin_token', v_game.admin_token,
    'students', v_students
  );
end;
$$;

create or replace function update_settings(p_admin_token text, p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games;
  v_patch jsonb;
begin
  v_game := resolve_game(p_admin_token);
  if v_game.id is null then raise exception 'unauthorized'; end if;

  v_patch := sanitize_settings(p_settings);
  update games set settings = settings || v_patch where id = v_game.id;
  perform log_event(v_game.id, 'settings_updated', 'teacher', null, v_game.current_round_number, v_patch);

  return jsonb_build_object('ok', true, 'settings', v_patch);
end;
$$;

-- ---------------------------------------------------------------------------
-- add_students / rename_student
-- ---------------------------------------------------------------------------
create or replace function add_students(p_admin_token text, p_names text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games;
  v_name text;
  v_idx int;
  v_student_id uuid;
  v_token text;
  v_students jsonb := '[]'::jsonb;
begin
  v_game := resolve_game(p_admin_token);
  if v_game.id is null then raise exception 'unauthorized'; end if;

  select coalesce(max(seat_index), 0) into v_idx from students where game_id = v_game.id;

  foreach v_name in array p_names loop
    v_idx := v_idx + 1;
    v_token := gen_token(16);

    insert into students (game_id, seat_index, display_name)
    values (v_game.id, v_idx, coalesce(nullif(btrim(v_name), ''), 'Siswa ' || v_idx))
    returning id into v_student_id;

    insert into student_tokens (student_id, game_id, token) values (v_student_id, v_game.id, v_token);
    insert into scores (game_id, student_id) values (v_game.id, v_student_id);
    perform log_event(v_game.id, 'student_link_created', 'teacher', v_student_id);

    v_students := v_students || jsonb_build_array(jsonb_build_object('id', v_student_id, 'token', v_token));
  end loop;

  return jsonb_build_object('ok', true, 'students', v_students);
end;
$$;

create or replace function rename_student(p_admin_token text, p_student_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games;
  v_old text;
begin
  v_game := resolve_game(p_admin_token);
  if v_game.id is null then raise exception 'unauthorized'; end if;

  select display_name into v_old from students where id = p_student_id and game_id = v_game.id;
  if v_old is null then raise exception 'student_not_found'; end if;

  update students set display_name = btrim(p_name)
   where id = p_student_id and game_id = v_game.id;

  perform log_event(v_game.id, 'student_renamed', 'teacher', p_student_id, v_game.current_round_number,
                    jsonb_build_object('from', v_old, 'to', btrim(p_name)));
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- next_round — closes the current round and opens the next one. There is no
-- maximum: round_number just keeps counting.
-- ---------------------------------------------------------------------------
create or replace function next_round(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game     games;
  v_round    rounds;
  v_number   int;
  v_total    int;
  v_ready    int;
  v_open_at  timestamptz := null;
  v_countdown int;
begin
  v_game := resolve_game(p_admin_token);
  if v_game.id is null then raise exception 'unauthorized'; end if;
  if v_game.status = 'ended' then
    return jsonb_build_object('ok', false, 'error', 'game_ended');
  end if;

  if coalesce((v_game.settings->>'require_all_ready')::boolean, false) then
    select count(*), count(*) filter (where is_ready) into v_total, v_ready
      from students where game_id = v_game.id;
    if v_total = 0 or v_ready < v_total then
      return jsonb_build_object('ok', false, 'error', 'not_all_ready',
                                'ready', v_ready, 'total', v_total);
    end if;
  end if;

  -- Close the previous round for good.
  if v_game.current_round_id is not null then
    update rounds
       set state = 'complete',
           ended_at = coalesce(ended_at, clock_timestamp())
     where id = v_game.current_round_id
       and state <> 'complete';
  end if;

  v_number := v_game.current_round_number + 1;
  v_countdown := coalesce((v_game.settings->>'countdown_seconds')::int, 3);

  if coalesce(v_game.settings->>'buzzer_mode', 'manual') = 'auto' then
    v_open_at := clock_timestamp() + (v_countdown || ' seconds')::interval + activation_grace();
  end if;

  insert into rounds (game_id, round_number, state, buzzer_open_at)
  values (v_game.id, v_number,
          case when v_open_at is null then 'pending'::round_state else 'armed'::round_state end,
          v_open_at)
  returning * into v_round;

  update games
     set current_round_id = v_round.id,
         current_round_number = v_number,
         status = case when status = 'lobby' then 'active' else status end,
         started_at = coalesce(started_at, clock_timestamp())
   where id = v_game.id;

  perform log_event(v_game.id, 'round_started', 'teacher', null, v_number);
  if v_open_at is not null then
    perform log_event(v_game.id, 'buzzer_enabled', 'teacher', null, v_number,
                      jsonb_build_object('mode', 'auto', 'open_at', v_open_at,
                                         'countdown_seconds', v_countdown));
  end if;

  return jsonb_build_object('ok', true, 'round_id', v_round.id, 'round_number', v_number,
                            'buzzer_open_at', v_open_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- enable_buzzer / disable_buzzer
--
-- Activation is a server-authoritative timestamp, never a client timer. Every
-- device receives the same `buzzer_open_at` and counts down to it using its
-- measured offset from server_now(); the database independently refuses any
-- press that arrives before it.
-- ---------------------------------------------------------------------------
create or replace function enable_buzzer(p_admin_token text, p_countdown_seconds int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game    games;
  v_round   rounds;
  v_count   int;
  v_open_at timestamptz;
begin
  v_game := resolve_game(p_admin_token);
  if v_game.id is null then raise exception 'unauthorized'; end if;
  if v_game.status = 'ended' then return jsonb_build_object('ok', false, 'error', 'game_ended'); end if;
  if v_game.status = 'paused' then return jsonb_build_object('ok', false, 'error', 'game_paused'); end if;
  if v_game.current_round_id is null then return jsonb_build_object('ok', false, 'error', 'no_round'); end if;

  select * into v_round from rounds where id = v_game.current_round_id for update;

  if v_round.state = 'locked' then
    return jsonb_build_object('ok', false, 'error', 'round_has_winner');
  end if;
  if v_round.state = 'complete' then
    return jsonb_build_object('ok', false, 'error', 'round_complete');
  end if;

  v_count := coalesce(p_countdown_seconds, (v_game.settings->>'countdown_seconds')::int, 3);
  v_count := greatest(0, least(10, v_count));
  v_open_at := clock_timestamp() + (v_count || ' seconds')::interval + activation_grace();

  update rounds
     set state = 'armed',
         buzzer_open_at = v_open_at
   where id = v_round.id;

  update games set status = case when status = 'lobby' then 'active' else status end,
                   started_at = coalesce(started_at, clock_timestamp())
   where id = v_game.id;

  perform log_event(v_game.id, 'buzzer_enabled', 'teacher', null, v_round.round_number,
                    jsonb_build_object('mode', 'manual', 'open_at', v_open_at,
                                       'countdown_seconds', v_count));

  return jsonb_build_object('ok', true, 'buzzer_open_at', v_open_at, 'countdown_seconds', v_count);
end;
$$;

create or replace function disable_buzzer(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game  games;
  v_round rounds;
begin
  v_game := resolve_game(p_admin_token);
  if v_game.id is null then raise exception 'unauthorized'; end if;
  if v_game.current_round_id is null then return jsonb_build_object('ok', false, 'error', 'no_round'); end if;

  select * into v_round from rounds where id = v_game.current_round_id for update;
  if v_round.state <> 'armed' then return jsonb_build_object('ok', false, 'error', 'buzzer_not_armed'); end if;

  update rounds set state = 'pending', buzzer_open_at = null where id = v_round.id;
  perform log_event(v_game.id, 'buzzer_disabled', 'teacher', null, v_round.round_number);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- award_point — used when award_mode = 'manual': the teacher hears the answer
-- first, then decides. Idempotent; a round can only be paid out once.
-- ---------------------------------------------------------------------------
create or replace function award_point(p_admin_token text, p_points int default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game   games;
  v_round  rounds;
  v_points int;
begin
  v_game := resolve_game(p_admin_token);
  if v_game.id is null then raise exception 'unauthorized'; end if;
  if v_game.current_round_id is null then return jsonb_build_object('ok', false, 'error', 'no_round'); end if;

  select * into v_round from rounds where id = v_game.current_round_id for update;
  if v_round.winner_student_id is null then return jsonb_build_object('ok', false, 'error', 'no_winner'); end if;
  if v_round.points_awarded then return jsonb_build_object('ok', false, 'error', 'already_awarded'); end if;

  v_points := coalesce(p_points, (v_game.settings->>'points_per_win')::int, 1);

  insert into scores (game_id, student_id, score, wins, updated_at)
  values (v_game.id, v_round.winner_student_id, v_points, 1, clock_timestamp())
  on conflict (game_id, student_id) do update
    set score = scores.score + v_points,
        wins  = scores.wins + 1,
        updated_at = clock_timestamp();

  update rounds set points_awarded = true, awarded_points = v_points where id = v_round.id;

  perform log_event(v_game.id, 'points_awarded', 'teacher', v_round.winner_student_id,
                    v_round.round_number, jsonb_build_object('points', v_points));

  return jsonb_build_object('ok', true, 'points', v_points);
end;
$$;

-- ---------------------------------------------------------------------------
-- undo_winner — reverses the most recent valid winner and any points that
-- went with it. The original events stay in the history; the reversal is
-- recorded as a new event.
-- ---------------------------------------------------------------------------
create or replace function undo_winner(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game   games;
  v_round  rounds;
  v_winner uuid;
  v_points int;
begin
  v_game := resolve_game(p_admin_token);
  if v_game.id is null then raise exception 'unauthorized'; end if;
  if v_game.current_round_id is null then return jsonb_build_object('ok', false, 'error', 'no_round'); end if;

  select * into v_round from rounds where id = v_game.current_round_id for update;
  if v_round.winner_student_id is null then return jsonb_build_object('ok', false, 'error', 'no_winner'); end if;

  v_winner := v_round.winner_student_id;
  v_points := v_round.awarded_points;

  if v_round.points_awarded then
    update scores
       set score = greatest(0, score - v_points),
           wins  = greatest(0, wins - 1),
           updated_at = clock_timestamp()
     where game_id = v_game.id and student_id = v_winner;
  end if;

  update buzzes set accepted = false where id = v_round.winner_buzz_id;

  update rounds
     set winner_student_id = null,
         winner_buzz_id = null,
         points_awarded = false,
         awarded_points = 0,
         locked_at = null,
         state = 'pending',
         buzzer_open_at = null
   where id = v_round.id;

  perform log_event(v_game.id, 'winner_undone', 'teacher', v_winner, v_round.round_number,
                    jsonb_build_object('points_reverted', case when v_round.points_awarded then v_points else 0 end));

  return jsonb_build_object('ok', true, 'points_reverted',
                            case when v_round.points_awarded then v_points else 0 end);
end;
$$;

-- ---------------------------------------------------------------------------
-- reopen_buzzer — the wrong-answer path. Distinct from undo: the round keeps
-- going, the student who buzzed first loses their turn in it, and the buzzer
-- goes live again for everyone else with a fresh synchronized activation.
-- Bumping buzz_window invalidates every in-flight request from the previous
-- window and lets other students buzz cleanly.
-- ---------------------------------------------------------------------------
create or replace function reopen_buzzer(
  p_admin_token text,
  p_exclude_previous boolean default null,
  p_countdown_seconds int default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game     games;
  v_round    rounds;
  v_previous uuid;
  v_exclude  boolean;
  v_count    int;
  v_open_at  timestamptz;
  v_reverted int := 0;
begin
  v_game := resolve_game(p_admin_token);
  if v_game.id is null then raise exception 'unauthorized'; end if;
  if v_game.status = 'ended' then return jsonb_build_object('ok', false, 'error', 'game_ended'); end if;
  if v_game.status = 'paused' then return jsonb_build_object('ok', false, 'error', 'game_paused'); end if;
  if v_game.current_round_id is null then return jsonb_build_object('ok', false, 'error', 'no_round'); end if;

  select * into v_round from rounds where id = v_game.current_round_id for update;
  if v_round.winner_student_id is null then return jsonb_build_object('ok', false, 'error', 'no_winner'); end if;

  v_previous := v_round.winner_student_id;
  v_exclude  := coalesce(p_exclude_previous,
                         (v_game.settings->>'exclude_previous_on_reopen')::boolean, true);

  -- Only touch the score if one was actually paid out for this attempt.
  if v_round.points_awarded then
    v_reverted := v_round.awarded_points;
    update scores
       set score = greatest(0, score - v_reverted),
           wins  = greatest(0, wins - 1),
           updated_at = clock_timestamp()
     where game_id = v_game.id and student_id = v_previous;
  end if;

  v_count := coalesce(p_countdown_seconds, (v_game.settings->>'countdown_seconds')::int, 3);
  v_count := greatest(0, least(10, v_count));
  v_open_at := clock_timestamp() + (v_count || ' seconds')::interval + activation_grace();

  update rounds
     set winner_student_id = null,
         winner_buzz_id = null,
         points_awarded = false,
         awarded_points = 0,
         locked_at = null,
         state = 'armed',
         buzz_window = v_round.buzz_window + 1,
         buzzer_open_at = v_open_at,
         excluded_student_ids = case
           when v_exclude then array(select distinct unnest(v_round.excluded_student_ids || v_previous))
           else v_round.excluded_student_ids
         end
   where id = v_round.id;

  perform log_event(v_game.id, 'buzzer_reopened', 'teacher', v_previous, v_round.round_number,
                    jsonb_build_object('excluded_previous', v_exclude,
                                       'points_reverted', v_reverted,
                                       'open_at', v_open_at,
                                       'buzz_window', v_round.buzz_window + 1));

  return jsonb_build_object('ok', true, 'buzzer_open_at', v_open_at,
                            'points_reverted', v_reverted, 'excluded_previous', v_exclude);
end;
$$;

-- ---------------------------------------------------------------------------
-- pause_game / resume_game
--
-- Pause is a game-level status, so the round keeps its own state untouched and
-- resuming cannot accidentally start a new one. If the buzzer was live when
-- the teacher paused, resuming re-arms it with a fresh synchronized countdown
-- rather than snapping straight back to open — otherwise a student holding a
-- finger on the button would win the instant play resumes.
-- ---------------------------------------------------------------------------
create or replace function pause_game(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games;
begin
  v_game := resolve_game(p_admin_token);
  if v_game.id is null then raise exception 'unauthorized'; end if;
  if v_game.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'game_not_active'); end if;

  update games set status = 'paused' where id = v_game.id;
  perform log_event(v_game.id, 'game_paused', 'teacher', null, v_game.current_round_number);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function resume_game(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game    games;
  v_round   rounds;
  v_count   int;
  v_open_at timestamptz;
begin
  v_game := resolve_game(p_admin_token);
  if v_game.id is null then raise exception 'unauthorized'; end if;
  if v_game.status <> 'paused' then return jsonb_build_object('ok', false, 'error', 'game_not_paused'); end if;

  update games set status = 'active' where id = v_game.id;

  if v_game.current_round_id is not null then
    select * into v_round from rounds where id = v_game.current_round_id for update;
    if v_round.state = 'armed' then
      v_count := greatest(1, coalesce((v_game.settings->>'countdown_seconds')::int, 3));
      v_open_at := clock_timestamp() + (v_count || ' seconds')::interval + activation_grace();
      update rounds set buzzer_open_at = v_open_at where id = v_round.id;
    end if;
  end if;

  perform log_event(v_game.id, 'game_resumed', 'teacher', null, v_game.current_round_number,
                    jsonb_build_object('rearmed_at', v_open_at));
  return jsonb_build_object('ok', true, 'buzzer_open_at', v_open_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- end_game / clear_game
-- ---------------------------------------------------------------------------
create or replace function end_game(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games;
begin
  v_game := resolve_game(p_admin_token);
  if v_game.id is null then raise exception 'unauthorized'; end if;
  if v_game.status = 'ended' then return jsonb_build_object('ok', true, 'already_ended', true); end if;

  if v_game.current_round_id is not null then
    update rounds set state = 'complete', ended_at = coalesce(ended_at, clock_timestamp())
     where id = v_game.current_round_id;
  end if;

  update games set status = 'ended', ended_at = clock_timestamp() where id = v_game.id;
  update students set connected = false, is_ready = false where game_id = v_game.id;

  perform log_event(v_game.id, 'game_ended', 'teacher', null, v_game.current_round_number);
  return jsonb_build_object('ok', true);
end;
$$;

-- Destructive by design: students, rounds, buzz history, scores and events all
-- go with the game row via ON DELETE CASCADE. The UI confirms twice.
create or replace function clear_game(p_admin_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game games;
begin
  v_game := resolve_game(p_admin_token);
  if v_game.id is null then raise exception 'unauthorized'; end if;

  delete from games where id = v_game.id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- admin_snapshot — everything the dashboard renders, in one call.
--
-- Also reaps stale heartbeats: a student whose last sync is older than the
-- grace window is marked disconnected and the transition is recorded, which
-- is how "Terputus" appears without the student's device having to cooperate.
-- ---------------------------------------------------------------------------
create or replace function admin_snapshot(p_admin_token text, p_event_limit int default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game  games;
  v_round rounds;
  v_stale uuid[];
  v_id    uuid;
  v_pulse game_pulse;
begin
  v_game := resolve_game(p_admin_token);
  if v_game.id is null then raise exception 'unauthorized'; end if;

  select array_agg(id) into v_stale
    from students
   where game_id = v_game.id
     and connected
     and (last_seen_at is null or last_seen_at < clock_timestamp() - interval '25 seconds');

  if v_stale is not null then
    update students set connected = false where id = any(v_stale);
    foreach v_id in array v_stale loop
      perform log_event(v_game.id, 'student_disconnected', 'system', v_id);
    end loop;
    select * into v_game from games where id = v_game.id;
  end if;

  if v_game.current_round_id is not null then
    select * into v_round from rounds where id = v_game.current_round_id;
  end if;
  select * into v_pulse from game_pulse where game_id = v_game.id;

  return jsonb_build_object(
    'ok', true,
    'server_time', clock_timestamp(),
    'revision', coalesce(v_pulse.revision, 0),
    'game', jsonb_build_object(
      'id', v_game.id,
      'join_code', v_game.join_code,
      'status', v_game.status,
      'current_round_number', v_game.current_round_number,
      'settings', v_game.settings,
      'created_at', v_game.created_at,
      'started_at', v_game.started_at,
      'ended_at', v_game.ended_at
    ),
    'round', case when v_round.id is null then null else jsonb_build_object(
      'id', v_round.id,
      'number', v_round.round_number,
      'state', v_round.state,
      'buzz_window', v_round.buzz_window,
      'buzzer_open_at', v_round.buzzer_open_at,
      'winner_student_id', v_round.winner_student_id,
      'points_awarded', v_round.points_awarded,
      'awarded_points', v_round.awarded_points,
      'excluded_student_ids', to_jsonb(v_round.excluded_student_ids)
    ) end,
    'students', coalesce((
      select jsonb_agg(row_to_json(r)::jsonb order by r.seat_index)
        from (
          select s.id,
                 s.seat_index,
                 s.display_name as name,
                 t.token,
                 s.is_ready,
                 s.connected
                   and s.last_seen_at is not null
                   and s.last_seen_at > clock_timestamp() - interval '25 seconds' as connected,
                 s.last_seen_at,
                 coalesce(sc.score, 0) as score,
                 coalesce(sc.wins, 0) as wins,
                 (b.id is not null) as buzzed_this_round,
                 b.pressed_at as buzzed_at,
                 coalesce(b.accepted, false) as is_round_winner
            from students s
            join student_tokens t on t.student_id = s.id
            left join scores sc on sc.student_id = s.id
            left join buzzes b on b.student_id = s.id
                              and b.round_id = v_round.id
                              and b.buzz_window = v_round.buzz_window
           where s.game_id = v_game.id
        ) r
    ), '[]'::jsonb),
    'leaderboard', coalesce((
      select jsonb_agg(row_to_json(r)::jsonb order by r.rank, r.seat_index)
        from (
          select s.id,
                 s.seat_index,
                 s.display_name as name,
                 coalesce(sc.score, 0) as score,
                 coalesce(sc.wins, 0) as wins,
                 rank() over (order by coalesce(sc.score, 0) desc, coalesce(sc.wins, 0) desc, s.seat_index) as rank
            from students s
            left join scores sc on sc.student_id = s.id
           where s.game_id = v_game.id
        ) r
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(row_to_json(e)::jsonb order by e.id desc)
        from (
          select id, type, actor, student_id, student_name, round_number, payload, created_at
            from game_events
           where game_id = v_game.id
           order by id desc
           limit greatest(1, least(500, p_event_limit))
        ) e
    ), '[]'::jsonb)
  );
end;
$$;
