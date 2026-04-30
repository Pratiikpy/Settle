import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";

export const runtime = "nodejs";

/**
 * F21 — Record a payer's confirmed contribution.
 *
 *   POST /api/split-bills/[id]/confirm
 *   body: { payer: pubkey, sig: tx_signature }
 *
 * Server verifies the tx exists on-chain and the buyer claimed it. Inserts a row in
 * split_bill_payments. If the row count reaches n_payers, marks the bill completed_at.
 *
 * No wallet-sig auth — the on-chain tx signature IS the proof. We trust the network,
 * not the caller. (We do double-check the tx by fetching it via RPC.)
 */

const Body = z.object({
  payer: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  sig: z.string().min(80).max(120),
});

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

function getSupabase() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
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

  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "supabase_unconfigured" }, { status: 503 });

  const { data: bill, error: billErr } = await supabase
    .from("split_bills")
    .select("organizer_pubkey, per_payer_lamports, n_payers, completed_at")
    .eq("id", id)
    .maybeSingle();
  if (billErr) {
    return NextResponse.json(
      { error: "supabase_error", message: billErr.message },
      { status: 502 },
    );
  }
  if (!bill) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Verify on-chain that this tx exists and the payer is among the signers. Avoids
  // a malicious caller fabricating a sig string.
  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const tx = await connection.getTransaction(body.sig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) {
    return NextResponse.json({ error: "tx_not_found" }, { status: 404 });
  }
  const payerKey = new PublicKey(body.payer);
  const accountKeys = tx.transaction.message.getAccountKeys
    ? tx.transaction.message.getAccountKeys({})
    : null;
  const signerKeys = accountKeys
    ? Array.from({ length: tx.transaction.message.header.numRequiredSignatures }, (_, i) =>
        accountKeys.get(i)?.toBase58(),
      )
    : (tx.transaction.message as unknown as { accountKeys: Array<unknown> }).accountKeys
        ?.slice(0, tx.transaction.message.header.numRequiredSignatures)
        ?.map((k) => (k as { toBase58?: () => string }).toBase58?.() ?? String(k));
  if (!signerKeys?.includes(payerKey.toBase58())) {
    return NextResponse.json(
      { error: "tx_signer_mismatch", message: "tx is not signed by the claimed payer" },
      { status: 400 },
    );
  }

  // Insert the payment row. Composite-key (bill_id, payer_pubkey) prevents double-record.
  const { error: insErr } = await supabase.from("split_bill_payments").insert({
    bill_id: id,
    payer_pubkey: body.payer,
    amount_lamports: String(bill.per_payer_lamports),
    sig_solscan: body.sig,
  });
  if (insErr && !insErr.message.includes("duplicate")) {
    return NextResponse.json(
      { error: "supabase_error", message: insErr.message },
      { status: 502 },
    );
  }

  // Recount and close if we've hit n_payers.
  const { count } = await supabase
    .from("split_bill_payments")
    .select("id", { count: "exact", head: true })
    .eq("bill_id", id);
  let completed = false;
  if (!bill.completed_at && (count ?? 0) >= bill.n_payers) {
    const { error: updErr } = await supabase
      .from("split_bills")
      .update({ completed_at: new Date().toISOString() })
      .eq("id", id)
      .is("completed_at", null);
    if (!updErr) completed = true;
  }

  return NextResponse.json({
    ok: true,
    id,
    paid_count: count ?? 0,
    n_payers: bill.n_payers,
    completed,
  });
}
