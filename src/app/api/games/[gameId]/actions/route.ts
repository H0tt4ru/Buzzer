import { NextResponse } from 'next/server';
import { adminTokenFrom, getServiceClient } from '@/lib/supabase/admin';
import type { AdminAction } from '@/types/game';

export const dynamic = 'force-dynamic';

/**
 * POST /api/games/[gameId]/actions
 *
 * Every teacher mutation goes through here. The handler does three things and
 * nothing else: check the credential, map the action name to an RPC, pass the
 * arguments through. All validation — can this round be reopened, is the game
 * paused, has this point already been awarded — belongs to the database, which
 * is the only place it can be enforced atomically. Duplicating those checks
 * here would create two answers to the same question.
 */
type Args = Record<string, unknown>;

const DISPATCH: Record<AdminAction, (token: string, body: Args) => [string, Args]> = {
  next_round: (token) => ['next_round', { p_admin_token: token }],
  enable_buzzer: (token, body) => [
    'enable_buzzer',
    { p_admin_token: token, p_countdown_seconds: intOrNull(body.countdown_seconds) },
  ],
  disable_buzzer: (token) => ['disable_buzzer', { p_admin_token: token }],
  award_point: (token, body) => [
    'award_point',
    { p_admin_token: token, p_points: intOrNull(body.points) },
  ],
  undo_winner: (token) => ['undo_winner', { p_admin_token: token }],
  reopen_buzzer: (token, body) => [
    'reopen_buzzer',
    {
      p_admin_token: token,
      p_exclude_previous: typeof body.exclude_previous === 'boolean' ? body.exclude_previous : null,
      p_countdown_seconds: intOrNull(body.countdown_seconds),
    },
  ],
  pause_game: (token) => ['pause_game', { p_admin_token: token }],
  resume_game: (token) => ['resume_game', { p_admin_token: token }],
  end_game: (token) => ['end_game', { p_admin_token: token }],
  clear_game: (token) => ['clear_game', { p_admin_token: token }],
  update_settings: (token, body) => [
    'update_settings',
    {
      p_admin_token: token,
      p_settings: body.settings && typeof body.settings === 'object' ? body.settings : {},
    },
  ],
  add_students: (token, body) => [
    'add_students',
    {
      p_admin_token: token,
      p_names: Array.isArray(body.names)
        ? body.names.filter((name): name is string => typeof name === 'string').slice(0, 200)
        : [],
    },
  ],
  rename_student: (token, body) => [
    'rename_student',
    {
      p_admin_token: token,
      p_student_id: String(body.student_id ?? ''),
      p_name: String(body.name ?? '').slice(0, 60),
    },
  ],
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  void (await params);

  const token = adminTokenFrom(request);
  if (!token) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  let body: Args & { action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: 'generic' }, { status: 400 });
  }

  const action = body.action;
  if (typeof action !== 'string' || !(action in DISPATCH)) {
    return NextResponse.json({ ok: false, error: 'generic' }, { status: 400 });
  }

  const build = DISPATCH[action as AdminAction];
  const [fn, args] = build(token, body);

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc(fn, args);

    if (error) {
      const message = error.message ?? '';
      if (/unauthorized/.test(message)) {
        return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 403 });
      }
      return NextResponse.json({ ok: false, error: extract(message) }, { status: 400 });
    }

    // The RPCs answer soft failures in the body ({ ok: false, error: ... }),
    // which is a 200 at the HTTP level: the request was understood, the game
    // just would not allow it. The client reads `ok`, not the status.
    return NextResponse.json(data ?? { ok: true }, {
      status: 200,
      headers: { 'cache-control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'generic' }, { status: 500 });
  }
}

function intOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** Pulls a known error code out of a Postgres message. */
function extract(message: string): string {
  const match =
    /(not_all_ready|no_round|no_winner|already_awarded|game_ended|game_paused|game_not_active|game_not_paused|round_has_winner|round_complete|buzzer_not_armed|student_not_found|no_students|too_many_students)/.exec(
      message,
    );
  return match?.[1] ?? 'generic';
}
