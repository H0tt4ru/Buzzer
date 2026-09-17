#!/usr/bin/env bash
#
# Integration tests for the buzzer's server-side guarantees.
#
# These run against a real PostgreSQL, because the properties being tested —
# that exactly one of eight simultaneous presses wins, that a duplicate tap
# cannot produce a second win, that reopening a round reverts a point — only
# exist at the level of row locks and unique constraints. A mocked database
# would be asserting that the mock behaves as written.
#
# Usage, either:
#   DATABASE_URL='postgresql://postgres:pw@127.0.0.1:54322/postgres' ./concurrency.sh
#   PSQL='psql -h /tmp -p 5433 -U postgres -d buzzer'                ./concurrency.sh
#
# Against a Supabase project use the connection string from
# Project Settings -> Database. Apply the migrations first; this script only
# tests, it does not create the schema.
#
# The script creates its own game and clears it at the end (clear_game
# cascades), so it is safe to run against a database holding other games.

set -uo pipefail

# The psql invocation is kept as an array and never passed through eval: the
# SQL below contains both single and double quotes (jsonb literals), and a
# second round of shell parsing is exactly what mangles them.
if [ -n "${DATABASE_URL:-}" ]; then
  PSQL_CMD=(psql "$DATABASE_URL")
elif [ -n "${PSQL:-}" ]; then
  read -ra PSQL_CMD <<< "$PSQL"
else
  echo "Set DATABASE_URL or PSQL. Examples:" >&2
  echo "  DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' $0" >&2
  echo "  PSQL='psql -h /tmp -p 5433 -U postgres -d buzzer' $0" >&2
  exit 2
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

# -q -t -A: quiet, tuples only, unaligned — a single value comes back bare.
q() { "${PSQL_CMD[@]}" -q -t -A -c "$1"; }

pass=0
fail=0

check() { # name expected actual
  if [ "$2" == "$3" ]; then
    echo "  PASS  $1"
    pass=$((pass + 1))
  else
    echo "  FAIL  $1 (expected '$2', got '$3')"
    fail=$((fail + 1))
  fi
}

echo "=== setup: one game, eight students ==="
CREATE=$(q "select create_game(array['Andi','Budi','Citra','Dimas','Eka','Fitri','Gilang','Hana'], '{\"countdown_seconds\":0,\"award_mode\":\"auto\"}'::jsonb);")

if [ -z "$CREATE" ]; then
  echo "create_game returned nothing — are the migrations applied?" >&2
  exit 2
fi

ADMIN=$(printf '%s' "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['admin_token'])")
GAME=$(printf '%s' "$CREATE" | python3 -c "import sys,json; print(json.load(sys.stdin)['game_id'])")

printf '%s' "$CREATE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
with open('$WORKDIR/tokens.txt', 'w') as handle:
    for student in data['students']:
        handle.write(student['token'] + chr(10))
"
echo "  game_id=$GAME"

# ---------------------------------------------------------------------------
echo "=== validation: presses the server must refuse ==="
T1=$(head -1 "$WORKDIR/tokens.txt")

check "buzz before any round has started" "game_not_started" \
  "$(q "select student_buzz('$T1')::jsonb->>'reason';")"

q "select next_round('$ADMIN');" > /dev/null
check "buzz while the buzzer is disabled" "buzzer_closed" \
  "$(q "select student_buzz('$T1')::jsonb->>'reason';")"

q "select enable_buzzer('$ADMIN', 0);" > /dev/null
check "buzz before the activation instant" "too_early" \
  "$(q "select student_buzz('$T1')::jsonb->>'reason';")"

check "buzz with an unknown token" "invalid_token" \
  "$(q "select student_buzz('definitely-not-a-token')::jsonb->>'result';")"

# ---------------------------------------------------------------------------
echo "=== concurrency: eight presses at one instant ==="
sleep 1
RESULTS="$WORKDIR/results.jsonl"
: > "$RESULTS"

# Each student gets their own connection and spins until a shared wall-clock
# target, so the presses genuinely contend rather than arriving in sequence.
TARGET=$(python3 -c "import time; print(time.time() + 1.5)")

while read -r token; do
  [ -z "$token" ] && continue
  (
    python3 -c "
import time
while time.time() < $TARGET:
    pass
"
    "${PSQL_CMD[@]}" -q -t -A -c "select student_buzz('$token');" >> "$RESULTS" 2>/dev/null
  ) &
done < "$WORKDIR/tokens.txt"
wait

WON=$(grep -c '"result": "won"' "$RESULTS")
LATE=$(grep -c '"result": "too_late"' "$RESULTS")
echo "  responses=$(wc -l < "$RESULTS") won=$WON too_late=$LATE"

check "exactly one winner among eight concurrent presses" "1" "$WON"
check "every other press was told it was too late" "7" "$LATE"

check "exactly one winner recorded" "1" \
  "$(q "select count(distinct winner_student_id) from rounds where game_id='$GAME' and winner_student_id is not null;")"
check "exactly one accepted buzz row" "1" \
  "$(q "select count(*) from buzzes b join rounds r on r.id=b.round_id where r.game_id='$GAME' and b.accepted;")"
check "exactly one point in the whole game" "1" \
  "$(q "select coalesce(sum(score),0) from scores where game_id='$GAME';")"
check "round locked once it has a winner" "locked" \
  "$(q "select state from rounds where game_id='$GAME' and round_number=1;")"

# ---------------------------------------------------------------------------
echo "=== double-tap prevention ==="
WINNER_TOKEN=$(q "select t.token from student_tokens t join rounds r on r.winner_student_id=t.student_id where r.game_id='$GAME' and r.round_number=1;")
LOSER_TOKEN=$(grep -v "^$WINNER_TOKEN$" "$WORKDIR/tokens.txt" | head -1)

check "winner tapping again is a duplicate, not a second win" "true" \
  "$(q "select student_buzz('$WINNER_TOKEN')::jsonb->>'duplicate';")"
check "still one buzz row for the winner" "1" \
  "$(q "select count(*) from buzzes b join rounds r on r.id=b.round_id where r.game_id='$GAME' and b.student_id=r.winner_student_id;")"
check "a losing student tapping again is a duplicate" "duplicate" \
  "$(q "select student_buzz('$LOSER_TOKEN')::jsonb->>'result';")"

# ---------------------------------------------------------------------------
echo "=== pause and resume ==="
q "select pause_game('$ADMIN');" > /dev/null
check "buzz refused while the game is paused" "game_paused" \
  "$(q "select student_buzz('$LOSER_TOKEN')::jsonb->>'reason';")"
check "reopen refused while the game is paused" "game_paused" \
  "$(q "select reopen_buzzer('$ADMIN')::jsonb->>'error';")"
q "select resume_game('$ADMIN');" > /dev/null
check "resume returns the game to active" "active" \
  "$(q "select status from games where id='$GAME';")"

# ---------------------------------------------------------------------------
echo "=== reopen after a wrong answer ==="
q "select reopen_buzzer('$ADMIN', true, 0);" > /dev/null

check "the point is taken back" "0" \
  "$(q "select coalesce(score,0) from scores where game_id='$GAME' and student_id in (select student_id from student_tokens where token='$WINNER_TOKEN');")"
check "buzz window advanced, invalidating in-flight presses" "1" \
  "$(q "select buzz_window from rounds where game_id='$GAME' and round_number=1;")"

sleep 1
check "the previous winner is locked out of this round" "excluded" \
  "$(q "select student_buzz('$WINNER_TOKEN')::jsonb->>'reason';")"
check "another student can win the reopened round" "won" \
  "$(q "select student_buzz('$LOSER_TOKEN')::jsonb->>'result';")"
check "the reopen is in the history" "1" \
  "$(q "select count(*) from game_events where game_id='$GAME' and type='buzzer_reopened';")"

# ---------------------------------------------------------------------------
echo "=== undo the last winner ==="
q "select undo_winner('$ADMIN');" > /dev/null
check "score reverted" "0" \
  "$(q "select coalesce(sum(score),0) from scores where game_id='$GAME';")"
check "winner cleared from the round" "none" \
  "$(q "select coalesce(winner_student_id::text,'none') from rounds where game_id='$GAME' and round_number=1;")"
check "the undo is recorded as a new event" "1" \
  "$(q "select count(*) from game_events where game_id='$GAME' and type='winner_undone';")"
check "the original wins are still in the history" "2" \
  "$(q "select count(*) from game_events where game_id='$GAME' and type='winner_determined';")"

# ---------------------------------------------------------------------------
echo "=== readiness gate ==="
q "select update_settings('$ADMIN', '{\"require_all_ready\":true}'::jsonb);" > /dev/null
check "round refused while some students are not ready" "not_all_ready" \
  "$(q "select next_round('$ADMIN')::jsonb->>'error';")"

while read -r token; do
  [ -z "$token" ] && continue
  q "select student_set_ready('$token', true);" > /dev/null
done < "$WORKDIR/tokens.txt"

check "round starts once everyone is ready" "true" \
  "$(q "select next_round('$ADMIN')::jsonb->>'ok';")"
check "pulse reports the ready count" "8" \
  "$(q "select ready_count from game_pulse where game_id='$GAME';")"

# ---------------------------------------------------------------------------
echo "=== automatic buzzer mode ==="
q "select update_settings('$ADMIN', '{\"buzzer_mode\":\"auto\",\"countdown_seconds\":3}'::jsonb);" > /dev/null
OPEN_AT=$(q "select next_round('$ADMIN')::jsonb->>'buzzer_open_at';")
if [ -n "$OPEN_AT" ]; then
  echo "  PASS  auto mode arms the round with a server timestamp"
  pass=$((pass + 1))
else
  echo "  FAIL  auto mode did not set buzzer_open_at"
  fail=$((fail + 1))
fi
check "the auto round is armed, not open" "armed" \
  "$(q "select state from rounds where game_id='$GAME' order by round_number desc limit 1;")"
check "the countdown still refuses an early press" "too_early" \
  "$(q "select student_buzz('$T1')::jsonb->>'reason';")"

# ---------------------------------------------------------------------------
echo "=== leaderboard visibility ==="
check "students get no standings by default" "null" \
  "$(q "select coalesce((student_state('$T1')::jsonb->>'leaderboard'),'null');")"
q "select update_settings('$ADMIN', '{\"student_leaderboard\":true}'::jsonb);" > /dev/null
check "standings appear once the teacher allows it" "t" \
  "$(q "select (student_state('$T1')::jsonb->'leaderboard') is not null;")"

# ---------------------------------------------------------------------------
echo "=== end of game ==="
q "select end_game('$ADMIN');" > /dev/null
check "buzz refused after the game ends" "game_ended" \
  "$(q "select student_buzz('$T1')::jsonb->>'reason';")"
check "game marked ended" "ended" \
  "$(q "select status from games where id='$GAME';")"
check "the pulse revision advanced with the game" "t" \
  "$(q "select revision > 5 from game_pulse where game_id='$GAME';")"

# ---------------------------------------------------------------------------
echo "=== clear game cascades ==="
q "select clear_game('$ADMIN');" > /dev/null
check "students deleted" "0" \
  "$(q "select count(*) from students where game_id='$GAME';")"
check "history deleted" "0" \
  "$(q "select count(*) from game_events where game_id='$GAME';")"
check "pulse row deleted" "0" \
  "$(q "select count(*) from game_pulse where game_id='$GAME';")"

echo
echo "===== $pass passed, $fail failed ====="
[ "$fail" -eq 0 ]
