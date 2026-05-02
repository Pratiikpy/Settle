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
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/group-accounts/request-spend
 *
 * body: { group_id, requester_pubkey, dest_pubkey, amount_usdc, note? }
 *
 * Creates a group_spend_requests row + returns an unsigned open_pact
 * tx. The custodian (or any voter — but ideally the custodian since
 * they control the holding card's authority) signs to spawn a Pact
 * scoped to this exact request: cap = amount, allowlist = [dest].
 *
 * After confirmation, the request status stays 'pending' until enough
 * members approve via /api/group-accounts/approve. Once quorum hits,
 * /approve flips status='quorum_met'; the signer cron picks it up.
 *
 * The Pact PDA is deterministic from (holding_card, scope_label_hash)
 * where scope_label = `group-${group_id_short}-${request_id_short}`.
 * That keeps it reproducible if this endpoint is retried — same call
 * twice gives the same PDA.
 *
 * Auth: requester must be a voter member of the group. Voters can
 * propose; viewers can't. We check via group_account_members.
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const Body = z.object({
  group_id: z.string().regex(UUID_RE),
  requester_pubkey: z.string().regex(PUBKEY_RE),
  dest_pubkey: z.string().regex(PUBKEY_RE),
  amount_usdc: z.string().regex(/^\d+(\.\d{1,6})?$/),
  note: z.string().max(280).optional(),
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

  // 1. Verify group + requester is a voter.
  const { data: group } = await sb
    .from("group_accounts")
    .select("group_id, holding_card, custodian_pubkey, quorum, threshold_lamports")
    .eq("group_id", v.group_id)
    .maybeSingle();
  if (!group)
    return NextResponse.json({ error: "group_not_found" }, { status: 404 });

  const { data: member } = await sb
    .from("group_account_members")
    .select("role")
    .eq("group_id", v.group_id)
    .eq("member_pubkey", v.requester_pubkey)
    .maybeSingle();
  if (!member || member.role !== "voter") {
    return NextResponse.json(
      { error: "not_a_voter" },
      { status: 403 },
    );
  }

  // 2. Insert request row first — we need request_id for the scope label.
  const amountLamports = BigInt(
    Math.round(parseFloat(v.amount_usdc) * 1_000_000),
  );

  // AU-11-001 fix — pre-mint the request_id server-side so we can
  // derive the Pact PDA BEFORE the insert. Eliminates the race window
  // where a reader could observe the placeholder all-1s pubkey between
  // insert and update.
  const requestId = randomUUID();
  const scopeLabel = `group-${v.group_id.slice(0, 8)}-${requestId.slice(0, 8)}`;
  const scopeHash = labelHashBytes(scopeLabel);
  const holdingCard = new PublicKey(group.holding_card);
  const [pactPda] = findPactPda(holdingCard, scopeHash);

  const { data: pendingRequest, error: insertErr } = await sb
    .from("group_spend_requests")
    .insert({
      request_id: requestId,
      group_id: v.group_id,
      requester_pubkey: v.requester_pubkey,
      dest_pubkey: v.dest_pubkey,
      amount_lamports: amountLamports.toString(),
      note: v.note ?? null,
      pact_pubkey: pactPda.toBase58(),
      status: "pending",
    })
    .select()
    .single();
  if (insertErr || !pendingRequest) {
    return NextResponse.json(
      { error: "insert_failed", detail: insertErr?.message },
      { status: 500 },
    );
  }

  // 3. Build the open_pact tx the requester signs.
  const usdcMint = new PublicKey(getUsdcMint());
  const requester = new PublicKey(v.requester_pubkey);

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const currentSlot = await connection.getSlot("confirmed");
  // Pact expires when the request expires (7 days default). Convert
  // wall-clock to absolute slot via ~400ms/slot.
  const expiresAt = new Date(pendingRequest.expires_at as string);
  const slotsUntilExpiry = BigInt(
    Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 400)),
  );
  const absoluteExpirySlot = BigInt(currentSlot) + slotsUntilExpiry;

  const ix = openPactIx({
    authority: requester,
    parentCard: holdingCard,
    pact: pactPda,
    usdcMint,
    args: {
      scopeLabelHash: scopeHash,
      capLamports: amountLamports,
      // Allowlist contains ONLY the dest, so the relayer can never
      // redirect funds even if N members are colluding.
      allowlist: [
        { merchant: new PublicKey(v.dest_pubkey), capabilityHash: null },
      ],
      expirySlot: absoluteExpirySlot,
    },
  });

  const tx = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash(
    "confirmed",
  );
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = requester;

  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  return NextResponse.json({
    ok: true,
    request_id: requestId,
    transaction: txBase64,
    pact_pubkey: pactPda.toBase58(),
    cap_lamports: amountLamports.toString(),
    cap_usdc: (Number(amountLamports) / 1e6).toFixed(2),
    quorum_required: group.quorum,
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    message: `Group spend request: $${(Number(amountLamports) / 1e6).toFixed(2)} USDC to ${v.dest_pubkey.slice(0, 6)}…${v.dest_pubkey.slice(-4)}. Sign to spawn the scoped Pact, then collect ${group.quorum} approvals.`,
  });
}
