import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "../../../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Native receipt webhook retry — admin endpoint.
 *
 * Mirrors the federation retry pattern: failed deliveries past
 * MAX_ATTEMPTS get stuck in `webhook_delivery_failed` state. This
 * route resets them to `pending` so the indexer's webhook-worker
 * picks them up again on next poll.
 *
 * Auth: Bearer ${SETTLE_INTERNAL_API_KEY} — operator-only.
 *
 * Wave 1 / Stream B4.
 */

const Body = z.object({
  delivery_id: z.string().uuid().optional(),
  // Or bulk reset by webhook URL (for one merchant who fixed their endpoint).
  webhook_url: z.string().url().optional(),
  // Or bulk reset all failed in the last N hours.
  max_age_hours: z.coerce.number().int().min(1).max(24 * 7).optional(),
});

export async function POST(req: NextRequest) {
  // Auth
  const auth = req.headers.get("authorization") ?? "";
  const expected = process.env.SETTLE_INTERNAL_API_KEY;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const v = parsed.data;
  if (!v.delivery_id && !v.webhook_url && !v.max_age_hours) {
    return NextResponse.json(
      {
        error: "missing_filter",
        hint: "Pass delivery_id OR webhook_url OR max_age_hours",
      },
      { status: 400 },
    );
  }

  let sb;
  try {
    sb = getSupabaseServiceClient();
  } catch {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }

  let qb = sb
    .from("webhook_delivery_log")
    .update({
      status: "pending",
      attempts: 0,
      last_error: null,
      retried_at: new Date().toISOString(),
    })
    .eq("status", "failed");

  if (v.delivery_id) {
    qb = qb.eq("delivery_id", v.delivery_id);
  } else if (v.webhook_url) {
    qb = qb.eq("webhook_url", v.webhook_url);
  } else if (v.max_age_hours) {
    const cutoff = new Date(Date.now() - v.max_age_hours * 3600_000).toISOString();
    qb = qb.gte("created_at", cutoff);
  }

  const { data, error } = await qb.select("delivery_id");
  if (error) {
    return NextResponse.json(
      { error: "reset_failed", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    reset_count: data?.length ?? 0,
    delivery_ids: (data ?? []).map((d) => d.delivery_id),
  });
}
