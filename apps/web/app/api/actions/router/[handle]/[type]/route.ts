import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * Universal Solana Action / Blink router (P5).
 *
 * One endpoint dispatches every shareable handle action by type:
 *   tip       → GET preview, POST builds USDC TransferChecked + reference (Solana Pay)
 *   pay       → same as tip (alias for "I'm sending you money")
 *   request   → buyer pre-fills $X, can override on-chain
 *
 * Future types (wired into the universal manifest in a single place):
 *   hire      → delegates to /api/actions/hire/[slug]/spawn
 *   fund      → opens + funds a Pact (delegates to /api/agents/spawn)
 *   revoke    → delegates to /api/actions/revoke/[card]
 *
 * URL params:
 *   amount    decimal USDC (e.g. "5", "0.50"). Optional; spec param `{amount}` for the
 *             "Custom" action input means the wallet prompts the user.
 *   note      memo line attached via Memo program (optional, max 200 chars)
 *
 * The handle resolves to a wallet pubkey via the @settle handles table OR can be a raw
 * pubkey directly (for pubkey-based payments without a registered handle).
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Content-Encoding, Accept-Encoding",
};

const USDC_MINTS = {
  mainnet: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  devnet: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
};

const SUPPORTED_TYPES = ["tip", "pay", "request"] as const;
type ActionType = (typeof SUPPORTED_TYPES)[number];

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

async function resolveHandle(handle: string): Promise<{ pubkey: PublicKey; displayName?: string } | null> {
  // Direct pubkey passthrough
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(handle)) {
    try {
      return { pubkey: new PublicKey(handle) };
    } catch {
      // fall through
    }
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await supabase
      .from("handles")
      .select("pubkey, display_name")
      .eq("handle", handle.toLowerCase())
      .maybeSingle();
    if (!data) return null;
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(data.pubkey)) return null;
    return {
      pubkey: new PublicKey(data.pubkey),
      ...(data.display_name ? { displayName: data.display_name } : {}),
    };
  } catch {
    return null;
  }
}

function isType(t: string): t is ActionType {
  return (SUPPORTED_TYPES as readonly string[]).includes(t);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string; type: string }> },
) {
  const { handle, type } = await params;
  if (!isType(type)) {
    return NextResponse.json(
      { error: "unknown_type", supported: SUPPORTED_TYPES },
      { status: 404, headers: CORS },
    );
  }

  const resolved = await resolveHandle(handle);
  if (!resolved) {
    return NextResponse.json(
      { error: "handle_not_found", handle },
      { status: 404, headers: CORS },
    );
  }

  const url = new URL(req.url);
  const presetAmount = url.searchParams.get("amount") ?? url.searchParams.get("req");
  const note = url.searchParams.get("note");

  const displayHandle = resolved.displayName ?? `@${handle}`;
  const titleByType: Record<ActionType, string> = {
    tip: `Tip ${displayHandle}`,
    pay: `Pay ${displayHandle}`,
    request: `Pay ${displayHandle}`,
  };
  const descriptionByType: Record<ActionType, string> = {
    tip: `Send a tip in USDC. Settles in under a second on Solana.${note ? ` "${note.slice(0, 80)}"` : ""}`,
    pay: `Send USDC.${note ? ` "${note.slice(0, 80)}"` : ""}`,
    request: `${displayHandle} is requesting a payment.${note ? ` "${note.slice(0, 80)}"` : ""}`,
  };

  // If the URL pinned an amount (e.g. ?req=20), surface that as the headline action and
  // also provide a custom-amount fallback. Otherwise use 1/5/20 presets.
  const noteParam = note ? `&note=${encodeURIComponent(note)}` : "";
  const actions = presetAmount
    ? [
        {
          label: `Send $${presetAmount}`,
          href: `/api/actions/router/${handle}/${type}?amount=${encodeURIComponent(presetAmount)}${noteParam}`,
        },
        {
          label: "Custom amount",
          href: `/api/actions/router/${handle}/${type}?amount={amount}${noteParam}`,
          parameters: [{ name: "amount", label: "USDC amount", required: true }],
        },
      ]
    : [
        { label: "$1", href: `/api/actions/router/${handle}/${type}?amount=1${noteParam}` },
        { label: "$5", href: `/api/actions/router/${handle}/${type}?amount=5${noteParam}` },
        { label: "$20", href: `/api/actions/router/${handle}/${type}?amount=20${noteParam}` },
        {
          label: "Custom",
          href: `/api/actions/router/${handle}/${type}?amount={amount}${noteParam}`,
          parameters: [{ name: "amount", label: "USDC amount", required: true }],
        },
      ];

  return NextResponse.json(
    {
      type: "action",
      title: titleByType[type],
      icon: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://settle.so"}/icon-512`,
      description: descriptionByType[type],
      label: presetAmount ? `Send $${presetAmount}` : "Send",
      links: { actions },
    },
    { headers: CORS },
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ handle: string; type: string }> },
) {
  const { handle, type } = await params;
  if (!isType(type)) {
    return NextResponse.json({ error: "unknown_type" }, { status: 404, headers: CORS });
  }

  const resolved = await resolveHandle(handle);
  if (!resolved) {
    return NextResponse.json(
      { error: "handle_not_found", handle },
      { status: 404, headers: CORS },
    );
  }

  let body: { account?: string };
  try {
    body = (await req.json()) as { account?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers: CORS });
  }
  if (!body.account || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.account)) {
    return NextResponse.json({ error: "invalid_account" }, { status: 400, headers: CORS });
  }
  let from: PublicKey;
  try {
    from = new PublicKey(body.account);
  } catch {
    return NextResponse.json({ error: "invalid_pubkey" }, { status: 400, headers: CORS });
  }

  const url = new URL(req.url);
  const amountStr = url.searchParams.get("amount") ?? url.searchParams.get("req") ?? "5";
  const note = url.searchParams.get("note");

  const decimal = parseFloat(amountStr);
  if (!Number.isFinite(decimal) || decimal <= 0) {
    return NextResponse.json({ error: "invalid_amount" }, { status: 400, headers: CORS });
  }
  const amountBase = BigInt(Math.round(decimal * 1_000_000));

  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  const usdcMint = cluster === "mainnet" ? USDC_MINTS.mainnet : USDC_MINTS.devnet;
  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });

  // Solana Pay reference pubkey embedded as read-only key.
  const reference = Keypair.generate().publicKey;
  const fromAta = await getAssociatedTokenAddress(usdcMint, from);
  const toAta = await getAssociatedTokenAddress(usdcMint, resolved.pubkey);

  const tx = new Transaction();

  // Recipient ATA may not exist yet — sender pays rent.
  let toAtaExists = true;
  try {
    await getAccount(connection, toAta);
  } catch {
    toAtaExists = false;
  }
  if (!toAtaExists) {
    tx.add(createAssociatedTokenAccountInstruction(from, toAta, resolved.pubkey, usdcMint));
  }

  const transferIx = createTransferCheckedInstruction(
    fromAta,
    usdcMint,
    toAta,
    from,
    amountBase,
    6,
  );
  // Solana Pay reference (read-only non-signer key) so the recipient can find the tx
  // via getSignaturesForAddress(reference).
  transferIx.keys.push({ pubkey: reference, isSigner: false, isWritable: false });
  tx.add(transferIx);

  // Optional memo
  if (note && note.trim().length > 0) {
    const memoProgram = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    tx.add({
      keys: [],
      programId: memoProgram,
      data: Buffer.from(note.trim().slice(0, 200), "utf8"),
    });
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = from;

  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false, verifySignatures: false }),
  ).toString("base64");

  const displayHandle = resolved.displayName ?? `@${handle}`;
  return NextResponse.json(
    {
      transaction: txBase64,
      message:
        type === "request"
          ? `Pay $${amountStr} USDC to ${displayHandle}.${note ? ` "${note.slice(0, 60)}"` : ""}`
          : `Send $${amountStr} USDC to ${displayHandle}.${note ? ` "${note.slice(0, 60)}"` : ""}`,
    },
    { headers: CORS },
  );
}

export function OPTIONS() {
  return NextResponse.json(null, { headers: CORS });
}
