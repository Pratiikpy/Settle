import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * F5.9 — Idempotency-Key middleware.
 *
 * Wraps any POST handler with replay-cache semantics. Caller passes an
 * Idempotency-Key header; on first execution we cache the response;
 * on replay we return the cached response with X-Idempotent-Replay: 1.
 *
 * Usage in a route handler:
 *   export async function POST(req: NextRequest) {
 *     return withIdempotency(req, "/api/send/build", async () => {
 *       // ... your real handler logic returning NextResponse.json(...)
 *       return NextResponse.json({ ok: true, foo: "bar" });
 *     });
 *   }
 *
 * Constraints:
 *   - Header is OPTIONAL. If absent, the handler runs normally.
 *   - Key length: 1..200 chars (Stripe convention).
 *   - TTL: 24h via the migration's expires_at default.
 *   - The cached body is what the handler returned — including 4xx errors,
 *     because failures should also be idempotent (re-submitting a 400 a
 *     second time should still get a 400).
 */

const KEY_RE = /^[A-Za-z0-9_\-:.]{1,200}$/;

function getSb(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

interface CachedResponse {
  response_status: number;
  response_body: unknown;
}

export async function withIdempotency<T extends NextResponse>(
  req: NextRequest,
  path: string,
  handler: () => Promise<T>,
): Promise<NextResponse> {
  const key = req.headers.get("idempotency-key");
  if (!key) {
    return handler();
  }
  if (!KEY_RE.test(key)) {
    return NextResponse.json(
      {
        error: "invalid_idempotency_key",
        message:
          "Idempotency-Key must be 1..200 chars of [A-Za-z0-9_-:.] (Stripe convention).",
      },
      { status: 400 },
    );
  }

  const sb = getSb();
  if (!sb) {
    // Supabase not configured — fall through and run the handler. The
    // alternative (failing the request) would be more disruptive than
    // losing idempotency until ops fixes the config.
    return handler();
  }

  // 1. Look up cached response. Composite key (key, method, path).
  const method = req.method.toUpperCase();
  const { data: cached } = await sb
    .from("idempotency_keys")
    .select("response_status, response_body, expires_at")
    .eq("key", key)
    .eq("method", method)
    .eq("path", path)
    .maybeSingle();
  if (cached) {
    const expired = new Date(cached.expires_at as string).getTime() < Date.now();
    if (!expired) {
      const body = cached.response_body as Record<string, unknown> | null;
      return NextResponse.json(body ?? {}, {
        status: cached.response_status as number,
        headers: { "X-Idempotent-Replay": "1" },
      });
    }
    // Expired — delete and let the handler run fresh.
    await sb
      .from("idempotency_keys")
      .delete()
      .eq("key", key)
      .eq("method", method)
      .eq("path", path);
  }

  // 2. Run the handler.
  const res = await handler();

  // 3. Cache the response. We serialize the body via res.clone() + .json().
  // If the body isn't JSON or is empty, we skip the cache (the next replay
  // will re-execute, which is acceptable degradation).
  let body: unknown = null;
  try {
    body = await res.clone().json();
  } catch {
    body = null;
  }
  if (body !== null) {
    const { error: insErr } = await sb.from("idempotency_keys").insert({
      key,
      method,
      path,
      response_status: res.status,
      response_body: body as Record<string, unknown>,
    });
    if (insErr && insErr.code !== "23505") {
      // Race: another concurrent replay won. The other replay's cached
      // version is what subsequent calls will see. We still return our
      // computed response to THIS caller for consistency.
      console.warn(`[idempotency] cache insert failed: ${insErr.message}`);
    }
  }

  return res;
}
