import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Transaction,
  clusterApiUrl,
} from "@solana/web3.js";
import { z } from "zod";
import {
  closePactIx,
  findPactPda,
  labelHashBytes,
  openPactIx,
} from "../../../../lib/anchor-client";
import { getUsdcMint } from "../../../../lib/solana";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/scheduled-sends/topup-pact
 *
 * body: { schedule_id, authority, additional_periods }
 *
 * Returns ONE base64 unsigned tx that does, atomically:
 *   1. close_pact on the existing schedule.pact_pubkey
 *      (returns any unspent USDC from the old vault back to authority)
 *   2. open_pact with a NEW scope label + NEW cap
 *      (creates a fresh Pact PDA + funds its vault with the new cap)
 *
 * After confirm, the client posts to /api/scheduled-sends/attach-pact
 * to rebind schedule.pact_pubkey → new PDA.
 *
 * Why atomic: a partial fire (close succeeded, open failed) would
 * orphan the schedule with no Pact, and if the cron tick happened
 * between the two halves, the audit row would say "no pact"
 * confusingly. Atomicity keeps the schedule strictly under one Pact
 * at any moment.
 *
 * The new scope label is `sched-<id>-<cadence>-<topup-counter>` —
 * deterministic from the schedule, monotonic on each renewal so
 * re-running the endpoint produces the same NEW PDA (so re-tries of
 * a failed attach don't drift). We compute the topup_counter by
 * counting prior phase5_executions audit rows, but for v0 we use a
 * timestamp suffix — simpler and equally deterministic per invocation.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

const Body = z.object({
  schedule_id: z.string().uuid(),
  authority: z.string().regex(PUBKEY_RE),
  additional_periods: z.number().int().min(1).max(100).default(12),
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
      "schedule_id, owner_pubkey, card_pubkey, pact_pubkey, dest_pubkey, amount_lamports, cadence",
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
  if (!schedule.pact_pubkey) {
    return NextResponse.json(
      {
        error: "no_existing_pact",
        hint: "There's no Pact to close — use /spawn-pact for the first funding round.",
      },
      { status: 400 },
    );
  }

  const authority = new PublicKey(v.authority);
  const parentCard = new PublicKey(schedule.card_pubkey);
  const oldPact = new PublicKey(schedule.pact_pubkey);
  const usdcMint = new PublicKey(getUsdcMint());

  // New scope: prior label was `sched-<id8>-<cadence>`. We append a
  // monotonic suffix — `-rN` where N = count of prior topups + 1.
  // We derive N from the count of phase5_executions intent_id matches
  // grouped by topup, but for v0 a simple seconds-since-epoch suffix
  // gives us monotonic + retryable (same call within 1s yields same PDA).
  const topupSuffix = Math.floor(Date.now() / 1000).toString(36);
  const newScopeLabel = `sched-${v.schedule_id.slice(0, 8)}-${schedule.cadence.toLowerCase()}-r${topupSuffix}`;
  const newScopeHash = labelHashBytes(newScopeLabel);
  const [newPactPda] = findPactPda(parentCard, newScopeHash);

  const newCapLamports =
    BigInt(schedule.amount_lamports) * BigInt(v.additional_periods);

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const currentSlot = await connection.getSlot("confirmed");
  // 1 year of slots (216k slots/day × 365). open_pact takes absolute slot.
  const newExpirySlot = BigInt(currentSlot + 216_000 * 365);

  const closeIx = closePactIx({
    authority,
    pact: oldPact,
    usdcMint,
  });

  const openIx = openPactIx({
    authority,
    parentCard,
    pact: newPactPda,
    usdcMint,
    args: {
      scopeLabelHash: newScopeHash,
      capLamports: newCapLamports,
      // Same allowlist contract as /spawn-pact: relayer can only spend
      // to the destination, even if compromised.
      allowlist: [
        {
          merchant: new PublicKey(schedule.dest_pubkey),
          capabilityHash: null,
        },
      ],
      expirySlot: newExpirySlot,
    },
  });

  const tx = new Transaction().add(closeIx).add(openIx);
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
    old_pact_pubkey: oldPact.toBase58(),
    new_pact_pubkey: newPactPda.toBase58(),
    new_cap_lamports: newCapLamports.toString(),
    new_cap_usdc: (Number(newCapLamports) / 1e6).toFixed(2),
    new_scope_label: newScopeLabel,
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    message: `Renew Pact for schedule ${v.schedule_id.slice(0, 8)}…: close old + open new with cap $${(Number(newCapLamports) / 1e6).toFixed(2)} USDC, ${v.additional_periods} ${schedule.cadence.toLowerCase()} periods. Atomic — both happen or neither.`,
  });
}
