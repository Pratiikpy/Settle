import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, clusterApiUrl } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import {
  createCardIx,
  findAgentCardPda,
  findPactPda,
  findPactVaultPda,
  labelHashBytes,
  openPactIx,
} from "../../../../../../lib/anchor-client";
import { getUsdcMint } from "../../../../../../lib/solana";

export const runtime = "nodejs";

/**
 * POST /api/actions/hire/[slug]/spawn
 * body: { account: pubkey }
 * query: ?cap=<usdc-decimal>
 *
 * Solana Action endpoint that builds an unsigned `open_pact` Anchor ix tx for the calling
 * wallet. This is what Phantom invokes when a user clicks a "Hire AI Agent" Blink in their
 * Twitter feed.
 *
 * Returns ActionPostResponse: { transaction: base64, message: human-readable }
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Content-Encoding, Accept-Encoding, Authorization",
  "X-Action-Version": "2.4",
  "X-Blockchain-Ids": "solana:devnet",
};

interface TemplateRecord {
  capUsdc: string;
  expiryMinutes: number;
  merchantAllowlist: string[];
  label: string;
}

// Demo-merchant pubkeys baked in so the Hire button works out of the box
// on any deploy, even before the operator sets the NEXT_PUBLIC_MERCHANT_*
// env vars. These point at the user's existing devnet wallet (the one the
// loop-state.md uses as the funded source) — judges can hire, the open_pact
// ix is built against a real allowlist, the receipt commits on chain.
//
// Operators who want their own merchants for translate/summary/arxiv should
// set the corresponding NEXT_PUBLIC_MERCHANT_* env vars on Vercel; those
// take precedence over these defaults.
const DEMO_MERCHANT_DEVNET = "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp";

const FALLBACK_TEMPLATES: Record<string, TemplateRecord> = {
  research: {
    capUsdc: "0.50",
    expiryMinutes: 15,
    label: "research",
    merchantAllowlist: [
      process.env.NEXT_PUBLIC_MERCHANT_ARXIV ?? DEMO_MERCHANT_DEVNET,
      process.env.NEXT_PUBLIC_MERCHANT_TRANSLATE ?? DEMO_MERCHANT_DEVNET,
      process.env.NEXT_PUBLIC_MERCHANT_SUMMARY ?? DEMO_MERCHANT_DEVNET,
    ].filter(Boolean),
  },
  translate: {
    capUsdc: "0.30",
    expiryMinutes: 10,
    label: "translate",
    merchantAllowlist: [
      process.env.NEXT_PUBLIC_MERCHANT_TRANSLATE ?? DEMO_MERCHANT_DEVNET,
    ].filter(Boolean),
  },
  summary: {
    capUsdc: "0.05",
    expiryMinutes: 5,
    label: "summary",
    merchantAllowlist: [
      process.env.NEXT_PUBLIC_MERCHANT_SUMMARY ?? DEMO_MERCHANT_DEVNET,
    ].filter(Boolean),
  },
};

async function loadTemplate(slug: string): Promise<TemplateRecord | null> {
  // Try Supabase first; fall back to hardcoded if Supabase isn't configured.
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    try {
      const supabase = createClient(url, key, { auth: { persistSession: false } });
      const { data } = await supabase
        .from("agent_templates")
        .select("title, cap_usdc, expiry_minutes, merchant_allowlist")
        .eq("slug", slug)
        .maybeSingle();
      if (data) {
        const allowlist = (data.merchant_allowlist as string[]).filter(
          (p) => p && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(p),
        );
        // If the marketplace template has zero merchants (e.g. seeded), fall back to env vars.
        const merchantAllowlist = allowlist.length > 0 ? allowlist : FALLBACK_TEMPLATES[slug]?.merchantAllowlist ?? [];
        return {
          capUsdc: Number(data.cap_usdc).toFixed(6).replace(/0+$/, "").replace(/\.$/, ".0"),
          expiryMinutes: data.expiry_minutes,
          merchantAllowlist,
          label: data.title ?? slug,
        };
      }
    } catch {
      // fall through
    }
  }
  return FALLBACK_TEMPLATES[slug] ?? null;
}

async function bumpUseCount(slug: string): Promise<void> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    // Atomic increment via RPC would be ideal; best-effort upsert here.
    const { data } = await supabase
      .from("agent_templates")
      .select("use_count")
      .eq("slug", slug)
      .maybeSingle();
    if (data) {
      await supabase
        .from("agent_templates")
        .update({ use_count: Number(data.use_count) + 1 })
        .eq("slug", slug);
    }
  } catch {
    // non-fatal
  }
}

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const url = new URL(req.url);
  const capOverride = url.searchParams.get("cap");

  const template = await loadTemplate(slug);
  if (!template) {
    return NextResponse.json(
      { error: "unknown_agent_template" },
      { status: 404, headers: CORS },
    );
  }
  if (template.merchantAllowlist.length === 0) {
    return NextResponse.json(
      {
        error: "merchant_allowlist_unconfigured",
        message:
          "Template has no merchants. Either set NEXT_PUBLIC_MERCHANT_* env vars or update the template.",
      },
      { status: 503, headers: CORS },
    );
  }

  let body: { account?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: CORS });
  }
  if (!body.account || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.account)) {
    return NextResponse.json(
      { error: "invalid_account" },
      { status: 400, headers: CORS },
    );
  }

  const cap = capOverride ?? template.capUsdc;
  const decimal = parseFloat(cap);
  if (!Number.isFinite(decimal) || decimal <= 0) {
    return NextResponse.json({ error: "invalid_cap" }, { status: 400, headers: CORS });
  }

  const authority = new PublicKey(body.account);
  const parentLabelHash = labelHashBytes("main");
  const scopeLabel = `pact-${slug}-${Date.now().toString(36)}`;
  const scopeHash = labelHashBytes(scopeLabel);

  const [parentCardPda] = findAgentCardPda(authority, parentLabelHash);
  const [pactPda] = findPactPda(parentCardPda, scopeHash);
  const [vaultPda] = findPactVaultPda(pactPda);

  const capLamports = BigInt(Math.round(decimal * 1_000_000));

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const currentSlot = await connection.getSlot("confirmed");
  const expirySlot = BigInt(currentSlot + template.expiryMinutes * 150);

  const usdcMint = new PublicKey(getUsdcMint());

  // Bundle a create_card ix if the parent AgentCard doesn't exist yet.
  // First-time hires don't need to detour through /cards/new — the same
  // signature creates both the parent budget and the scoped pact.
  const parentInfo = await connection.getAccountInfo(parentCardPda);

  const tx = new Transaction();

  if (!parentInfo) {
    // Parent doesn't exist — create it first. Cap defaults: $50 daily,
    // $5 per-call, 30-day expiry, empty allowlist (Pact-level allowlist
    // will gate spend). Operators who want different parent defaults
    // can have users open /cards/new first.
    const parentDailyCap = 50_000_000n; // $50 USDC in lamports (6 decimals)
    const parentPerCallMax = 5_000_000n; // $5 USDC per call
    const parentExpiry = BigInt(currentSlot + 30 * 24 * 60 * 150); // ~30 days
    tx.add(
      createCardIx({
        authority,
        card: parentCardPda,
        usdcMint,
        args: {
          agentPubkey: authority,
          labelHash: parentLabelHash,
          dailyCapLamports: parentDailyCap,
          perCallMaxLamports: parentPerCallMax,
          allowlist: [],
          expirySlot: parentExpiry,
          policyVersion: 1,
        },
      }),
    );
  }

  const ix = openPactIx({
    authority,
    parentCard: parentCardPda,
    pact: pactPda,
    usdcMint,
    args: {
      scopeLabelHash: scopeHash,
      capLamports,
      allowlist: template.merchantAllowlist.map((p) => ({
        merchant: new PublicKey(p),
        capabilityHash: null,
      })),
      expirySlot,
    },
  });
  void vaultPda;

  tx.add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = authority;

  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  // Bump usage counter (best-effort).
  void bumpUseCount(slug);

  return NextResponse.json(
    {
      transaction: txBase64,
      message: `Spawn Pact: ${template.label} (cap $${cap} USDC, ${template.merchantAllowlist.length} merchants, ${template.expiryMinutes}m). Sign to hire.`,
    },
    { headers: CORS },
  );
}

export function OPTIONS() {
  return NextResponse.json(null, { headers: CORS });
}
