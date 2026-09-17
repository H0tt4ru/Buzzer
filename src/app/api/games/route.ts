import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * POST /api/games
 *
 * The only unauthenticated write in the application: creating a game mints the
 * admin token that authorises everything after it. The names arrive from the
 * teacher's textarea; SQL caps the list at 200 and fills blanks itself.
 */
export async function POST(request: Request) {
  let payload: { names?: unknown; settings?: unknown };

  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ ok: false, error: 'no_students' }, { status: 400 });
  }

  const names = Array.isArray(payload.names)
    ? payload.names.filter((name): name is string => typeof name === 'string')
    : [];

  if (names.length === 0) {
    return NextResponse.json({ ok: false, error: 'no_students' }, { status: 400 });
  }
  if (names.length > 200) {
    return NextResponse.json({ ok: false, error: 'too_many_students' }, { status: 400 });
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc('create_game', {
      p_names: names,
      p_settings:
        payload.settings && typeof payload.settings === 'object' ? payload.settings : {},
    });

    if (error) {
      // The function raises bare codes ('too_many_students'); pass them through
      // so the client can translate rather than showing a Postgres string.
      return NextResponse.json({ ok: false, error: normalise(error.message) }, { status: 400 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: 'generic' }, { status: 500 });
  }
}

function normalise(message: string): string {
  const match = /(no_students|too_many_students|unauthorized)/.exec(message);
  return match?.[1] ?? 'generic';
}
