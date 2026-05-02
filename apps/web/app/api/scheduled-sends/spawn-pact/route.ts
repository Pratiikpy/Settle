import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, clusterApiUrl } from "@solana/web3.js";
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
 * POST /api/scheduled-sends/spawn-pact
 *
 * body: { schedule_id, authority, periods_to_fund }
 *   periods_to_fund: how many cycles' worth of USDC to lock into the
 *   Pact upfront. e.g. 12 for "fund a year of monthly rent."
 *
 * Builds an unsigned open_pact tx that the user signs in their wallet.
 * After confirmation, the user POSTs to /attach-pact to bind the new
 * Pact PDA back to the scheduled_send row.
 *
 * Splitting build vs. attach lets the wallet adapter handle signing
 * without the API blocking on confirmation. The PDA is deterministic
 * from (parent_card, scope_label_hash), so we return it pre-computed
 * — the caller can pass it to /attach-pact regardless of confirmation
 * timing.
 */

const Body = z.object({
  schedule_id: z.string().uuid(),
  authority: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  periods_to_fund: z.number().int().min(1).max(100).default(12),
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
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const { data: schedule } = await sb
    .from("scheduled_sends")
    .select(
      "schedule_id, owner_pubkey, card_pubkey, dest_pubkey, amount_lamports, cadence, pact_pubkey",
    )
    .eq("schedule_id", v.schedule_id)
    .maybeSingle();
  if (!schedule) {
    return NextResponse.json({ error: "schedule_not_found" }, { status: 404 });
  }
  if (schedule.owner_pubkey !== v.authority) {
    return NextResponse.json({ error: "not_your_schedule" }, { status: 403 });
  }
  if (!schedule.card_pubkey) {
    return NextResponse.json(
      { error: "no_card", hint: "Pick a delegated card on /wishes first." },
      { status: 400 },
    );
  }
  if (schedule.pact_pubkey) {
    return NextResponse.json(
      { error: "already_has_pact", pact_pubkey: schedule.pact_pubkey },
      { status: 409 },
    );
  }

  // Cap = amount × periods_to_fund. Keeps each Pact bounded so a
  // compromised relayer can never drain more than this user-set amount.
  const capLamports = BigInt(schedule.amount_lamports) * BigInt(v.periods_to_fund);

  // Scope label is deterministic per schedule so re-running this endpoint
  // (after a tx that didn't confirm) doesn't create a competing Pact.
  const scopeLabel = `sched-${v.schedule_id.slice(0, 8)}-${schedule.cadence.toLowerCase()}`;
  const scopeHash = labelHashBytes(scopeLabel);

  const authority = new PublicKey(v.authority);
  const parentCard = new PublicKey(schedule.card_pubkey);
  const [pactPda] = findPactPda(parentCard, scopeHash);

  const usdcMint = new PublicKey(getUsdcMint());
  // Expiry: 1 year of slots. ~216k slots/day × 365 = ~78.8M slots.
  // open_pact takes an absolute slot, so add to current slot.
  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const currentSlot = await connection.getSlot("confirmed");
  const expirySlot = BigInt(currentSlot + 216_000 * 365);

  const ix = openPactIx({
    authority,
    parentCard,
    pact: pactPda,
    usdcMint,
    args: {
      scopeLabelHash: scopeHash,
      capLamports,
      // Allowlist contains only the destination pubkey — relayer can spend
      // ONLY to this address, even if compromised.
      allowlist: [
        {
          merchant: new PublicKey(schedule.dest_pubkey),
          capabilityHash: null,
        },
      ],
      expirySlot,
    },
  });

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
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
    message: `Spawn Pact for schedule ${v.schedule_id.slice(0, 8)}…: cap $${(Number(capLamports) / 1e6).toFixed(2)} USDC, ${v.periods_to_fund} ${schedule.cadence.toLowerCase()} periods, dest ${schedule.dest_pubkey.slice(0, 6)}…${schedule.dest_pubkey.slice(-4)}`,
  });
}
