'use client';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Browser client. Uses the anon key, which can read exactly one table
 * (game_pulse) and execute exactly six functions, each of which demands a
 * student token. See supabase/migrations/0005_rls_and_grants.sql.
 */
let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY belum diatur.',
    );
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: {
      params: {
        // The buzzer is bursty: a round can produce one message per student in
        // a couple of seconds. The default of 10/s drops some of them.
        eventsPerSecond: 40,
      },
    },
  });

  return cached;
}
