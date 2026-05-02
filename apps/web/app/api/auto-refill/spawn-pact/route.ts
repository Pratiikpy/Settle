import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import { z } from "zod";
import {
  findPactPda,
  labelHashBytes,
  openPactIx,
} from "../../../../lib/anchor-client";
import { getUsdcMint } from "../../../../lib/solana";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auto-refill/spawn-pact
 *
 * body: { rule_id, authority, fund_count }
 *   fund_count: how many refills' worth of USDC to lock into the
 *   Pact upfront. Default 12.
 *
 * Builds an open_pact tx for the rule's source card (parent) with
 * allowlist=[dest_pubkey] and cap = refill_lamports × fund_count.
 *
 * After confirm, the client POSTs to /attach-pact to bind the new
 * Pact PDA back to the rule. The phase5-tick will then start
 * triggering balance-based refills.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const Body = z.object({
  rule_id: z.string().uuid(),
  authority: z.string().regex(PUBKEY_RE),
  fund_count: z.number().int().min(1).max(100).default(12),
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

  const { data: rule } = await sb
    .from("auto_refill_rules")
    .select(
      "rule_id, card_pubkey, owner_pubkey, refill_lamports, dest_pubkey, pact_pubkey",
    )
    .eq("rule_id", v.rule_id)
    .maybeSingle();
  if (!rule) {
    return NextResponse.json({ error: "rule_not_found" }, { status: 404 });
  }
  if (rule.owner_pubkey !== v.authority) {
    return NextResponse.json({ error: "not_your_rule" }, { status: 403 });
  }
  if (!rule.dest_pubkey) {
    return NextResponse.json(
      { error: "no_dest", hint: "Set dest_pubkey on the rule first." },
      { status: 400 },
    );
  }
  if (rule.pact_pubkey) {
    return NextResponse.json(
      { error: "already_has_pact", pact_pubkey: rule.pact_pubkey },
      { status: 409 },
    );
  }

  const authority = new PublicKey(v.authority);
  const parentCard = new PublicKey(rule.card_pubkey);
  const dest = new PublicKey(rule.dest_pubkey as string);
  const usdcMint = new PublicKey(getUsdcMint());

  const scopeLabel = `arefill-${v.rule_id.slice(0, 8)}`;
  const scopeHash = labelHashBytes(scopeLabel);
  const [pactPda] = findPactPda(parentCard, scopeHash);

  const capLamports = BigInt(rule.refill_lamports) * BigInt(v.fund_count);

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const currentSlot = await connection.getSlot("confirmed");
  // 1 year of slots.
  const expirySlot = BigInt(currentSlot + 216_000 * 365);

  const ix = openPactIx({
    authority,
    parentCard,
    pact: pactPda,
    usdcMint,
    args: {
      scopeLabelHash: scopeHash,
      capLamports,
      // Allowlist contains ONLY the destination — relayer can refill
      // only this wallet, ever, even if compromised.
      allowlist: [{ merchant: dest, capabilityHash: null }],
      expirySlot,
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
    pact_pubkey: pactPda.toBase58(),
    cap_lamports: capLamports.toString(),
    cap_usdc: (Number(capLamports) / 1e6).toFixed(2),
    scope_label: scopeLabel,
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    message: `Spawn auto-refill Pact: cap $${(Number(capLamports) / 1e6).toFixed(2)} USDC, ${v.fund_count} refills, dest ${(rule.dest_pubkey as string).slice(0, 6)}…`,
  });
}
