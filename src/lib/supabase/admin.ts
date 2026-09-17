import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only client holding the service role key. Never import this from a
 * component that ships to the browser — it is only used by the route handlers
 * under src/app/api, which check the x-admin-token header first.
 */
let cached: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Supabase server environment variables are missing.');
  }

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}

/** Extracts the teacher credential from a request. */
export function adminTokenFrom(request: Request): string | null {
  const header = request.headers.get('x-admin-token');
  if (header && header.length >= 8) return header;
  return null;
}
