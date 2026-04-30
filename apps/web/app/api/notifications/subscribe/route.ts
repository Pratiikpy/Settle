import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { authFromRequest } from "../../../../lib/wallet-auth";
import { getPublicVapidKey, isWebPushConfigured } from "../../../../lib/web-push";

export const runtime = "nodejs";

const SubBody = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  user_agent: z.string().optional(),
});

/**
 * POST /api/notifications/subscribe
 * Wallet-sig auth required. Body: standard PushSubscription.toJSON() shape.
 *
 * Upserts on endpoint (the natural primary key) so re-subscribing from the
 * same browser doesn't create duplicates.
 */
export async function POST(req: NextRequest) {
  if (!isWebPushConfigured()) {
    return NextResponse.json({ error: "web_push_not_configured" }, { status: 503 });
  }

  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json({ error: "unauthorized", reason: auth?.reason }, { status: 401 });
  }

  let body: z.infer<typeof SubBody>;
  try {
    body = SubBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "invalid_body", message: (e as Error).message }, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        endpoint: body.endpoint,
        pubkey: auth.pubkey,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_agent: body.user_agent ?? null,
        last_used_at: new Date().toISOString(),
        failed_count: 0,
      },
      { onConflict: "endpoint" },
    );

  if (error) {
    return NextResponse.json({ error: "supabase_error", message: error.message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await authFromRequest(req);
  if (!auth || !auth.ok) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const endpoint = req.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "missing_endpoint" }, { status: 400 });

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  }
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("pubkey", auth.pubkey);

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: isWebPushConfigured(),
    public_key: getPublicVapidKey(),
  });
}
