import { NextResponse } from 'next/server';
import { adminTokenFrom, getServiceClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/games/[gameId]/state
 *
 * The dashboard's whole payload — roster with tokens, scores, history. None of
 * it is readable with the anon key, which is the point: the browser gets it
 * only by presenting the admin token, and the token is checked against this
 * game before anything comes back.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ gameId: string }> },
) {
  const { gameId } = await params;
  const token = adminTokenFrom(request);

  if (!token) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc('admin_snapshot', { p_admin_token: token });

    if (error) {
      // resolve_game raises 'unauthorized' for an unknown or deleted game;
      // there is no way to tell the two apart without leaking whether a game
      // exists, so a valid-looking token that resolves to nothing is 403.
      const status = /unauthorized/.test(error.message) ? 403 : 500;
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status });
    }

    const snapshot = data as { ok?: boolean; game?: { id?: string } } | null;

    if (!snapshot?.ok) {
      return NextResponse.json({ ok: false, error: 'gameMissing' }, { status: 404 });
    }

    // The token is the credential, but the URL names a game: refuse a token
    // that belongs to a different one rather than quietly showing the wrong
    // dashboard.
    if (snapshot.game?.id !== gameId) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 403 });
    }

    return NextResponse.json(snapshot, {
      status: 200,
      headers: { 'cache-control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'generic' }, { status: 500 });
  }
}
