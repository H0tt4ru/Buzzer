-- ===========================================================================
-- 0006_enriched_pulse.sql — carry event metadata in every realtime pulse row.
--
-- Why: the current design fires one Postgres Change per state transition and
-- then forces every client to make an additional RPC call (admin_snapshot or
-- student_sync) before it knows what actually changed. By embedding the event
-- type and the student involved (if any) directly in the pulse row, the client
-- can apply state updates immediately from the realtime message and only fall
-- back to an RPC on major transitions or when personal data is needed.
--
-- last_event values (client-facing):
--   status_change     game.status changed (lobby→active, paused, ended, …)
--   round_started     a new round was inserted (next_round or auto-enable)
--   buzzer_enabled    round.state → armed with buzzer_open_at set
--   buzzer_disabled   round.state reverted to pending; buzzer_open_at cleared
--   buzz_window_reset round.buzz_window incremented (reopen_buzzer)
--   winner_determined round.winner_student_id set (student_buzz claims win)
--   points_awarded    round.points_awarded flipped true (manual mode confirm)
--   winner_undone     round.winner_student_id cleared; scores reversed
--   buzzer_reopened   excluded_student_ids updated; buzz_window bumped
--   settings_updated  games.settings JSON blob touched
--   student_ready     is_ready flipped by a student
--   student_added     roster grew (add_students)
--   roster_cleared    all students removed (clear_game cascade)
--   (NULL)            pre-migration pulse; treat as generic change
-- ===========================================================================

alter table game_pulse add column last_event text null;

-- ---------------------------------------------------------------------------
-- refresh_game_pulse: detect the event type from the resulting row and store
-- it alongside the projected data so every Postgres Changes message carries it.
-- ---------------------------------------------------------------------------
create or replace function refresh_game_pulse(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game     games;
  v_round    rounds;
  v_winner   text;
  v_students int := 0;
  v_ready    int := 0;
  v_buzzed   int := 0;
  v_last_event text;
  v_prev_state round_state;
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

  -- -----------------------------------------------------------------------
  -- Derive last_event from the resulting row shape.
  -- The AFTER trigger fires synchronously inside the mutating transaction,
  -- so the row already reflects the new state. We inspect it to infer the
  -- action that caused the change without needing each caller to annotate.
  -- -----------------------------------------------------------------------
  if v_game.status = 'ended' then
    v_last_event := 'status_change';
  elsif v_game.status = 'paused' then
    v_last_event := 'status_change';
  elsif v_round.id is not null then
    v_prev_state := v_round.state;
    if v_prev_state = 'locked' or v_prev_state = 'complete' then
      v_last_event := 'round_complete';
    elsif v_prev_state = 'armed' and v_round.winner_student_id is not null then
      v_last_event := 'winner_determined';
    elsif v_prev_state = 'pending' and v_round.state = 'armed' then
      v_last_event := case when v_round.buzzer_open_at is not null then 'buzzer_enabled' else 'round_started' end;
    elsif v_prev_state in ('armed', 'locked') and v_round.state = 'pending' then
      v_last_event := 'buzzer_disabled';
    elsif v_prev_state = 'pending' and v_round.state = 'pending' and v_round.buzz_window > 0 then
      v_last_event := 'buzz_window_reset';
    elsif v_round.winner_student_id is null and v_round.points_awarded then
      v_last_event := 'points_awarded';
    elsif v_round.winner_student_id is null and v_prev_state = 'armed' then
      v_last_event := 'round_started';
    else
      v_last_event := 'status_change';
    end if;
  else
    v_last_event := 'status_change';
  end if;

  insert into game_pulse as p (
    game_id, revision, status, current_round_number, round_id, round_state,
    buzz_window, buzzer_open_at, winner_student_id, winner_name,
    student_count, ready_count, buzzed_count, settings, updated_at, last_event
  )
  values (
    p_game_id, 1, v_game.status, v_game.current_round_number, v_round.id, v_round.state,
    coalesce(v_round.buzz_window, 0), v_round.buzzer_open_at, v_round.winner_student_id, v_winner,
    v_students, v_ready, v_buzzed, v_game.settings, clock_timestamp(), v_last_event
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
    updated_at           = excluded.updated_at,
    last_event           = excluded.last_event;
end;
$$;
