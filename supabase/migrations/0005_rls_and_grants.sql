-- ===========================================================================
-- 0005_rls_and_grants.sql — the security boundary.
--
-- Shape of it:
--   * RLS on, with no policy at all, on every table that holds anything worth
--     protecting. No policy means no row is visible or writable to anon, full
--     stop — there is no "students can update their own score" hole because
--     there is no student-facing write path to `scores` whatsoever.
--   * The single exception is `game_pulse`, which is read-only and carries
--     nothing sensitive. That is the realtime channel.
--   * All mutation happens through SECURITY DEFINER functions that demand a
--     credential (student token or admin token). Execute is revoked from
--     PUBLIC and granted back only where intended.
-- ===========================================================================

alter table games          enable row level security;
alter table students       enable row level security;
alter table student_tokens enable row level security;
alter table rounds         enable row level security;
alter table buzzes         enable row level security;
alter table scores         enable row level security;
alter table game_events    enable row level security;
alter table game_pulse     enable row level security;

-- Belt and braces: even if a future migration adds a permissive policy by
-- accident, the table privileges are not there.
revoke all on all tables in schema public from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The one readable table. Both the teacher's dashboard and every student
-- device subscribe to this and to nothing else.
-- ---------------------------------------------------------------------------
grant select on game_pulse to anon, authenticated;

create policy game_pulse_readable
  on game_pulse
  for select
  to anon, authenticated
  using (true);

-- Nobody but service_role and the definer functions may write history.
-- (No update/delete grant anywhere = append-only event log.)

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------
revoke all on function
  gen_token(int),
  log_event(uuid, text, text, uuid, int, jsonb),
  refresh_game_pulse(uuid),
  resolve_student(text),
  resolve_game(text),
  sanitize_settings(jsonb),
  activation_grace(),
  server_now(),
  student_state(text),
  student_sync(text),
  student_offline(text),
  student_set_ready(text, boolean),
  student_buzz(text),
  create_game(text[], jsonb),
  update_settings(text, jsonb),
  add_students(text, text[]),
  rename_student(text, uuid, text),
  next_round(text),
  enable_buzzer(text, int),
  disable_buzzer(text),
  award_point(text, int),
  undo_winner(text),
  reopen_buzzer(text, boolean, int),
  pause_game(text),
  resume_game(text),
  end_game(text),
  clear_game(text),
  admin_snapshot(text, int)
from public, anon, authenticated;

-- Student surface: reachable from the browser with the anon key, each call
-- authenticated by the student's own token. Called directly from the device
-- rather than proxied through a route handler, because the buzzer's latency
-- budget matters and the database is the authority either way.
grant execute on function server_now()                       to anon, authenticated;
grant execute on function student_state(text)                to anon, authenticated;
grant execute on function student_sync(text)                 to anon, authenticated;
grant execute on function student_offline(text)              to anon, authenticated;
grant execute on function student_set_ready(text, boolean)   to anon, authenticated;
grant execute on function student_buzz(text)                 to anon, authenticated;

-- Teacher surface: service_role only. Called from Next.js route handlers,
-- which check the x-admin-token header first.
grant execute on function create_game(text[], jsonb)         to service_role;
grant execute on function update_settings(text, jsonb)       to service_role;
grant execute on function add_students(text, text[])         to service_role;
grant execute on function rename_student(text, uuid, text)   to service_role;
grant execute on function next_round(text)                   to service_role;
grant execute on function enable_buzzer(text, int)            to service_role;
grant execute on function disable_buzzer(text)                to service_role;
grant execute on function award_point(text, int)              to service_role;
grant execute on function undo_winner(text)                   to service_role;
grant execute on function reopen_buzzer(text, boolean, int)   to service_role;
grant execute on function pause_game(text)                    to service_role;
grant execute on function resume_game(text)                   to service_role;
grant execute on function end_game(text)                      to service_role;
grant execute on function clear_game(text)                    to service_role;
grant execute on function admin_snapshot(text, int)           to service_role;

-- ---------------------------------------------------------------------------
-- Realtime: publish only the pulse row.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table game_pulse;
  end if;
end;
$$;
