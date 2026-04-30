import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "node:crypto";
import { sendPushToPubkey, isWebPushConfigured } from "../../../../lib/web-push";

export const runtime = "nodejs";

/**
 * Internal push fan-out endpoint, called by server-side workers (e.g. the
 * indexer's badge-cron) so they don't need to duplicate VAPID + RFC 8291
 * crypto in every service. The badge-cron has the user_pubkey of the just-
 * unlocked badge recipient; this route looks up their push subscriptions
 * from `push_subscriptions` and sends the encrypted payload.
 *
 * Auth: Bearer SETTLE_INTERNAL_API_KEY. Compared in constant time to defeat
 * timing oracles. If SETTLE_INTERNAL_API_KEY is unset on the server, the
 * route refuses ALL requests — there is no implicit "open if unconfigured"
 * fallback because that would silently expose the push fan-out publicly.
 */

const Body = z.object({
  pubkey: z.string().min(32),
  payload: z.object({
    title: z.string().min(1),
    body: z.string().min(1),
    url: z.string().optional(),
    icon: z.string().optional(),
  }),
});

function verifyBearer(req: NextRequest): boolean {
  const expected = process.env.SETTLE_INTERNAL_API_KEY;
  if (!expected || expected.length < 16) return false;
  const got = req.headers.get("authorization");
  if (!got || !got.startsWith("Bearer ")) return false;
  const token = got.slice("Bearer ".length);
  if (token.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!verifyBearer(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isWebPushConfigured()) {
    return NextResponse.json({ error: "web_push_not_configured" }, { status: 503 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch (e) {
    return NextResponse.json(
      { error: "invalid_body", message: (e as Error).message },
      { status: 400 },
    );
  }

  // Strip explicit-undefined keys so we don't trip exactOptionalPropertyTypes
  // on the downstream call.
  const payload: { title: string; body: string; url?: string; icon?: string } = {
    title: body.payload.title,
    body: body.payload.body,
    ...(body.payload.url !== undefined ? { url: body.payload.url } : {}),
    ...(body.payload.icon !== undefined ? { icon: body.payload.icon } : {}),
  };

  const result = await sendPushToPubkey(body.pubkey, payload);
  return NextResponse.json({ ok: true, ...result });
}
