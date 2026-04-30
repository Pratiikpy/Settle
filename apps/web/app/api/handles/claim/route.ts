import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { authFromRequest } from "../../../../lib/wallet-auth";

export const runtime = "nodejs";

/**
 * POST /api/handles/claim
 * body: { handle: string, display_name?: string, sns_domain?: string }
 *
 * Auth: caller must sign a wallet challenge. Pubkey from sig becomes the handle's owner.
 *
 * Validation:
 *   - handle matches /^[a-z0-9_-]{2,32}$/
 *   - handle not already claimed (UNIQUE constraint on `handles.handle`)
 *   - one handle per pubkey (UNIQUE constraint on `handles.pubkey`)
 */

const BodySchema = z.object({
  handle: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[a-z0-9_-]+$/, "handle must be lowercase alphanumeric, dash, or underscore"),
  display_name: z.string().max(64).optional(),
  sns_domain: z.string().max(128).optional(),
});

export async function POST(req: NextRequest) {
  // Auth — only the wallet owner can claim a handle for their pubkey
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json(
      { error: "auth_required", reason: auth?.ok === false ? auth.reason : "missing" },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parse = BodySchema.safeParse(raw);
  if (!parse.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parse.error.issues },
      { status: 400 },
    );
  }
  const body = parse.data;

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // Check if this pubkey already has a handle (one-per-pubkey constraint)
  const { data: existing } = await supabase
    .from("handles")
    .select("handle")
    .eq("pubkey", auth.pubkey)
    .maybeSingle();

  if (existing) {
    // Update existing handle (rename) — only if new handle is available
    const { error: uErr } = await supabase
      .from("handles")
      .update({
        handle: body.handle,
        ...(body.display_name !== undefined ? { display_name: body.display_name } : {}),
        ...(body.sns_domain !== undefined ? { sns_domain: body.sns_domain } : {}),
      })
      .eq("pubkey", auth.pubkey);
    if (uErr) {
      // Likely unique constraint violation
      return NextResponse.json(
        { error: "handle_taken_or_invalid", message: uErr.message },
        { status: 409 },
      );
    }
    return NextResponse.json({
      ok: true,
      action: "renamed",
      handle: body.handle,
      pubkey: auth.pubkey,
    });
  }

  // Insert new handle
  const { error: iErr } = await supabase.from("handles").insert({
    handle: body.handle,
    pubkey: auth.pubkey,
    display_name: body.display_name ?? null,
    sns_domain: body.sns_domain ?? null,
  });

  if (iErr) {
    return NextResponse.json(
      { error: "handle_taken_or_invalid", message: iErr.message },
      { status: 409 },
    );
  }

  return NextResponse.json({
    ok: true,
    action: "claimed",
    handle: body.handle,
    pubkey: auth.pubkey,
  });
}
