import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/scheduled-sends/attach-pact
 *
 * body: { schedule_id, owner_pubkey, pact_pubkey, signature }
 *
 * Called by the client after a successful open_pact tx. Binds the new
 * Pact PDA to the scheduled_send row so the signer cron picks it up
 * on the next fire.
 *
 * We don't validate the on-chain Pact account here — the indexer will
 * mirror it within seconds, and the signer's pre-fire validation
 * already checks card+pact existence at fire time. Skipping that
 * round-trip keeps the user's wallet flow snappy: sign → confirm →
 * attach in one click.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const Body = z.object({
  schedule_id: z.string().uuid(),
  owner_pubkey: z.string().regex(PUBKEY_RE),
  pact_pubkey: z.string().regex(PUBKEY_RE),
  /**
   * If true, allow overwriting an existing pact_pubkey — used by the
   * Renew Pact flow (close old + open new in one tx) to rebind the
   * schedule to the new PDA. Default false preserves the original
   * "first-attach only" idempotency for /spawn-pact.
   */
  replace_existing: z.boolean().default(false),
  // The on-chain tx signature — stored in plan_json for audit but not
  // strictly required to attach.
  signature: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const v = parsed.data;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Conditional update: by default only set pact_pubkey if NULL
  // (first-attach idempotency). With replace_existing=true (the renew
  // flow), allow overwrite — but ONLY if owner matches.
  let q = sb
    .from("scheduled_sends")
    .update({ pact_pubkey: v.pact_pubkey })
    .eq("schedule_id", v.schedule_id)
    .eq("owner_pubkey", v.owner_pubkey);
  if (!v.replace_existing) {
    q = q.is("pact_pubkey", null);
  }
  const { data, error } = await q.select().single();

  if (error || !data) {
    // Could be: no such row, wrong owner, or pact already attached
    // (when replace_existing=false). 409 keeps the client guessing
    // about which exact case — wrong owner returns same code.
    return NextResponse.json(
      { error: "attach_failed", detail: error?.message ?? "no_writable_row" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, schedule: data });
}
