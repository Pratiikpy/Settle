import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/federation/retry
 *
 * body: { origin_id?: string, max_age_hours?: number }
 *
 * Resets `failed` federated_receipts rows back to `pending` so the
 * federation poller's webhook fanout retries them. Useful when a
 * merchant's webhook URL was down during the original delivery and
 * has since come back up — without this, those rows stay stuck at
 * MAX_ATTEMPTS forever.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}` (we reuse the
 * cron secret so operator-only). A future iteration could add a
 * dedicated admin token.
 *
 * Filters:
 *   - origin_id (optional) → reset only rows from this origin
 *   - max_age_hours (default 24) → don't resurrect ancient failures
 *
 * Returns count of rows reset.
 */

const Body = z
  .object({
    origin_id: z.string().min(1).max(80).optional(),
    max_age_hours: z.number().int().min(1).max(720).default(24),
  })
  .partial()
  .default({});

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown = {};
  try {
    raw = await req.json();
  } catch {
    // empty body is fine — defaults apply.
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const v = parsed.data;
  const maxAgeHours = v.max_age_hours ?? 24;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const cutoff = new Date(Date.now() - maxAgeHours * 3_600_000).toISOString();

  let q = sb
    .from("federated_receipts")
    .update({
      webhook_delivery_status: "pending",
      webhook_attempts: 0,
      webhook_last_error: null,
    })
    .eq("webhook_delivery_status", "failed")
    .gte("imported_at", cutoff);
  if (v.origin_id) q = q.eq("origin_id", v.origin_id);

  const { data, error } = await q.select("federated_id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reset = (data ?? []).length;
  return NextResponse.json({
    ok: true,
    reset,
    filter: {
      origin_id: v.origin_id ?? null,
      max_age_hours: maxAgeHours,
    },
    message: `Reset ${reset} federated_receipts rows from failed → pending. Next poller tick (within 60s) will retry.`,
  });
}
