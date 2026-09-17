import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/time
 *
 * Fallback for the clock sync. Devices normally call server_now() directly
 * over the Supabase connection they already have; if that fails (a blocked
 * WebSocket, a captive portal rewriting requests) this route reads the same
 * database clock over plain HTTPS, so the countdown stays aligned rather than
 * silently falling back to the device's own time.
 */
export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase.rpc('server_now');

    if (error || !data) {
      return NextResponse.json(
        { now: new Date().toISOString(), source: 'edge' },
        { status: 200, headers: { 'cache-control': 'no-store' } },
      );
    }

    return NextResponse.json(
      { now: data as string, source: 'database' },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { now: new Date().toISOString(), source: 'edge' },
      { status: 200, headers: { 'cache-control': 'no-store' } },
    );
  }
}
