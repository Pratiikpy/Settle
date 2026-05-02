import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { computeCapabilityHashHex, type CapabilitySpec } from "@settle/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Capability registry (F9.2 + F3.4).
 *
 *   GET  /api/capabilities                — list (optional ?q= and ?domain=)
 *   GET  /api/capabilities?hash=…         — single-hash lookup (point query for badges)
 *   POST /api/capabilities                — contribute a hash → alias mapping
 *
 * Contributing requires:
 *   - capability_hash (the 32-byte hex hash)
 *   - alias (human name, 2-64 chars, allowed: A-Za-z0-9 space _ - / →)
 *   - description (optional)
 *   - spec (optional; if present, server recomputes the hash and sets
 *     verified=true on a match)
 *   - contributed_by_pubkey (the contributor's wallet)
 *
 * The (capability_hash, alias) composite PK means two contributors with
 * different aliases for the same hash both land — useful for i18n
 * ("Translate" + "翻訳") and disambiguating viewpoints.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const ALIAS_RE = /^[A-Za-z0-9 _\-/→]{2,64}$/;

const ContributeBody = z.object({
  capability_hash: z.string().regex(HEX64_RE),
  alias: z.string().regex(ALIAS_RE),
  description: z.string().max(500).optional(),
  spec: z
    .object({
      domain: z.string().min(1).max(128),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      path: z.string().min(1).max(2048),
      amount_lamports: z.string().regex(/^\d+$/),
      version: z.number().int().min(1).max(10000),
    })
    .optional(),
  contributed_by_pubkey: z.string().regex(PUBKEY_RE),
});

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const url = new URL(req.url);
  const hash = url.searchParams.get("hash");
  const q = url.searchParams.get("q")?.trim();
  const domain = url.searchParams.get("domain")?.trim();
  const verifiedOnly = url.searchParams.get("verified_only") === "1";
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? 50)));

  // Single-hash lookup — short-circuit + return all aliases for that hash.
  if (hash) {
    if (!HEX64_RE.test(hash.toLowerCase())) {
      return NextResponse.json({ error: "invalid_hash_format" }, { status: 400 });
    }
    const { data, error } = await sb
      .from("capability_registry")
      .select(
        "capability_hash, alias, description, spec_domain, spec_method, spec_path, spec_amount_lamports, spec_version, verified, contributed_by_pubkey, created_at",
      )
      .eq("capability_hash", hash.toLowerCase())
      .order("verified", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      return NextResponse.json(
        { error: "supabase_error", message: error.message },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, hash: hash.toLowerCase(), entries: data ?? [] });
  }

  // List query.
  let qb = sb
    .from("capability_registry")
    .select(
      "capability_hash, alias, description, spec_domain, spec_method, spec_path, verified, created_at",
    )
    .order("verified", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (q) qb = qb.ilike("alias", `%${q}%`);
  if (domain) qb = qb.eq("spec_domain", domain);
  if (verifiedOnly) qb = qb.eq("verified", true);
  const { data, error } = await qb;
  if (error) {
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    count: data?.length ?? 0,
    entries: data ?? [],
  });
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = ContributeBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const sb = getSb();
  if (!sb) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  // Verify: if spec is provided, recompute the hash and check it matches.
  // Mismatch = honest mistake or attempted spam; we still accept the entry
  // but flag verified=false so the UI shows a warning.
  let verified = false;
  if (parsed.data.spec) {
    try {
      const computed = computeCapabilityHashHex(parsed.data.spec as CapabilitySpec);
      verified = computed === parsed.data.capability_hash.toLowerCase();
    } catch {
      verified = false;
    }
  }

  const row = {
    capability_hash: parsed.data.capability_hash.toLowerCase(),
    alias: parsed.data.alias,
    description: parsed.data.description ?? null,
    spec_domain: parsed.data.spec?.domain ?? null,
    spec_method: parsed.data.spec?.method ?? null,
    spec_path: parsed.data.spec?.path ?? null,
    spec_amount_lamports: parsed.data.spec?.amount_lamports ?? null,
    spec_version: parsed.data.spec?.version ?? null,
    verified,
    contributed_by_pubkey: parsed.data.contributed_by_pubkey,
  };

  const { error } = await sb.from("capability_registry").insert(row);
  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({
        ok: true,
        idempotent: true,
        message: "Already contributed.",
      });
    }
    return NextResponse.json(
      { error: "supabase_error", message: error.message },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    capability_hash: row.capability_hash,
    alias: row.alias,
    verified: row.verified,
    message: verified
      ? "Contributed and verified ✓ — the spec produces this exact hash."
      : "Contributed unverified — provide the spec components to mark as verified.",
  });
}
