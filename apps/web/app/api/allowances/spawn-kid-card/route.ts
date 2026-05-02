import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import { z } from "zod";
import {
  createCardIx,
  findAgentCardPda,
  labelHashBytes,
} from "../../../../lib/anchor-client";
import { getUsdcMint } from "../../../../lib/solana";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/allowances/spawn-kid-card
 *
 * body: { allowance_id, kid_authority }
 *
 * Builds an unsigned create_card tx for the KID to sign. The card's
 * daily_cap_lamports comes from the allowance row, so the kid can't
 * spend more per day than the parent set — even if they accumulated a
 * surplus across weeks.
 *
 * This is a kid-side operation: the kid's wallet authority signs the
 * create_card. Parent can NOT spawn this on the kid's behalf because
 * Anchor's create_card requires authority signature.
 *
 * Per-call max: defaults to daily_cap (no per-call limit beyond the
 * daily). For kids who want a stricter "any single purchase max $X"
 * we'd add a separate column; v0 keeps daily as the only cap.
 *
 * Allowlist: empty in v0. Kids spend wherever; daily cap is the
 * primary constraint. A future enhancement adds parent-curated
 * allowlists via a /m/[handle]-style flow.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({
  allowance_id: z.string().regex(UUID_RE),
  kid_authority: z.string().regex(PUBKEY_RE),
});

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

export async function POST(req: NextRequest) {
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

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Fetch the allowance + verify the kid_authority matches kid_pubkey.
  const { data: allowance } = await sb
    .from("allowances")
    .select("allowance_id, kid_pubkey, kid_card, daily_cap_lamports, parent_pubkey")
    .eq("allowance_id", v.allowance_id)
    .maybeSingle();
  if (!allowance) {
    return NextResponse.json({ error: "allowance_not_found" }, { status: 404 });
  }
  if (allowance.kid_pubkey !== v.kid_authority) {
    return NextResponse.json(
      {
        error: "wallet_mismatch",
        message:
          "kid_authority must match the kid_pubkey on the allowance row",
      },
      { status: 403 },
    );
  }
  if (allowance.kid_card) {
    return NextResponse.json(
      {
        error: "already_has_card",
        kid_card: allowance.kid_card,
        message: "Kid card already spawned. Refresh /allowances to see it.",
      },
      { status: 409 },
    );
  }

  const authority = new PublicKey(v.kid_authority);
  const usdcMint = new PublicKey(getUsdcMint());

  // Label is deterministic from the allowance_id so re-runs of this
  // endpoint produce the same PDA — which means a hung mid-flight tx
  // doesn't strand a competing PDA. The kid's authority + this label
  // is the unique identity per (allowances.0001_allowance_link).
  const label = `allowance-${v.allowance_id.slice(0, 8)}`;
  const labelHash = labelHashBytes(label);
  const [cardPda] = findAgentCardPda(authority, labelHash);

  const dailyCap = BigInt(allowance.daily_cap_lamports);
  const perCallMax = dailyCap; // v0: per-call = daily cap (no per-call limit beyond daily)

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const currentSlot = await connection.getSlot("confirmed");
  // 1 year of slots — same as scheduled_send / auto_refill.
  const expirySlot = BigInt(currentSlot + 216_000 * 365);

  const ix = createCardIx({
    authority,
    card: cardPda,
    usdcMint,
    args: {
      // Kid is their own agent — they spend directly. No relayer
      // delegation here; that's parent-side (allowance.schedule_id
      // points to a parent-delegated card that funds the kid).
      agentPubkey: authority,
      labelHash,
      dailyCapLamports: dailyCap,
      perCallMaxLamports: perCallMax,
      // Empty allowlist = kid can spend anywhere (daily cap is the
      // constraint). Parent-curated allowlists are a future enhancement.
      allowlist: [],
      expirySlot,
      policyVersion: 1,
    },
  });

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
    "confirmed",
  );
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = authority;

  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  return NextResponse.json({
    ok: true,
    transaction: txBase64,
    kid_card: cardPda.toBase58(),
    daily_cap_lamports: dailyCap.toString(),
    daily_cap_usdc: (Number(dailyCap) / 1e6).toFixed(2),
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    message: `Spawn kid card with daily cap $${(Number(dailyCap) / 1e6).toFixed(2)} USDC. Sign in your wallet to create.`,
  });
}
