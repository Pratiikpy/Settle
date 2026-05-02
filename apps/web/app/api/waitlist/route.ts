import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServiceClient } from "../../../lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wave 6.1 — landing-page email capture.
 *
 * POST { email: string, source?: "landing" | "docs" | "embed" } → 200 ok
 *
 * Returns success even when the email already exists (don't leak account
 * existence). Validates a real-looking email; rejects obvious junk.
 *
 * Rate-limited per-IP via a simple in-memory counter (replace with
 * Upstash if abuse becomes real).
 */

const Body = z.object({
  email: z.string().email().max(254).toLowerCase(),
  source: z.enum(["landing", "docs", "embed"]).optional().default("landing"),
});

const HOURLY_LIMIT = 10;
const buckets = new Map<string, { count: number; reset: number }>();

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const cur = buckets.get(ip);
  if (!cur || cur.reset < now) {
    buckets.set(ip, { count: 1, reset: now + hourMs });
    return true;
  }
  if (cur.count >= HOURLY_LIMIT) return false;
  cur.count += 1;
  return true;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429 },
    );
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
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let sb;
  try {
    sb = getSupabaseServiceClient();
  } catch {
    // Don't fail the user if Supabase isn't configured locally — log + 200.
    console.warn("[waitlist] supabase not configured; email dropped:", parsed.data.email);
    return NextResponse.json({ ok: true });
  }

  const ua = req.headers.get("user-agent")?.slice(0, 512) ?? null;
  const ipCountry =
    req.headers.get("cf-ipcountry") ?? req.headers.get("x-vercel-ip-country") ?? null;

  const { error } = await sb.from("waitlist").insert({
    email: parsed.data.email,
    source: parsed.data.source,
    user_agent: ua,
    ip_country: ipCountry,
  });

  // 23505 = unique violation = email already on list. Treat as success.
  if (error && error.code !== "23505") {
    console.error("[waitlist] insert failed:", error.message);
    // Still return 200 to avoid leaking whether email is present.
  }

  return NextResponse.json({ ok: true });
}
