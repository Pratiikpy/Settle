/**
 * Canonical Supabase client factories for server-side routes.
 *
 * AU-09-006 fix — replaces the bug-prone inline pattern:
 *   const key = process.env.SUPABASE_SERVICE_ROLE_KEY
 *     ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 *
 * That fallback silently degrades writes to anon when the service-role
 * env is missing. Combined with partial RLS, anon writes return HTTP
 * 200 but no row inserts → fake-success. Routes that PERFORM WRITES
 * must call `getSupabaseServiceClient()` which throws loud.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "supabase_url_missing — set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).",
    );
  }
  return url;
}

/**
 * Service-role client — bypasses RLS. Use ONLY in server routes that
 * need to write or read across users. Throws if the secret env is
 * missing (no silent fallback).
 *
 * Throws `Error` with code-style message; callers should let it
 * surface as a 503 from the route handler.
 */
export function getSupabaseServiceClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "supabase_service_role_missing — SUPABASE_SERVICE_ROLE_KEY required for write paths.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Public anon client — subject to RLS. Use for genuinely public reads
 * (e.g. /api/feed, /api/leaderboard, /api/cnft/[id]/metadata.json).
 * Throws if neither key is set.
 */
export function getSupabasePublicClient(): SupabaseClient {
  const url = getSupabaseUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      "supabase_anon_missing — NEXT_PUBLIC_SUPABASE_ANON_KEY required for public reads.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Optional service client — returns null instead of throwing when
 * the service-role key is missing. Use in routes that have a
 * graceful-degraded read path. Document in caller why null is safe.
 */
export function tryGetSupabaseServiceClient(): SupabaseClient | null {
  try {
    return getSupabaseServiceClient();
  } catch {
    return null;
  }
}
