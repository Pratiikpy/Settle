import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, Keypair, clusterApiUrl } from "@solana/web3.js";
import { z } from "zod";
import { createCardIx, findAgentCardPda, labelHashBytes } from "../../../../lib/anchor-client";
import { getUsdcMint } from "../../../../lib/solana";

export const runtime = "nodejs";

/**
 * POST /api/agents/create-card
 *
 * Two modes for the agent keypair:
 *   1. Client-supplied (RECOMMENDED): client passes `agent_pubkey`. The server NEVER
 *      sees the agent privkey. The agent runtime (a separate service the user trusts)
 *      generates its own keypair, exposes the pubkey, and the user pins that on their
 *      card. The server-side `agent_secret_b58` field is omitted in the response.
 *   2. Server-generated (sandbox/legacy): if `agent_pubkey` is absent, the server
 *      generates a fresh keypair and returns the secret. Acceptable for devnet sandbox
 *      flows where the user trusts the facilitator with the agent privkey.
 *
 * The server-generated path is deprecated for production; it exists so the demo
 * onboarding flow doesn't require the user to set up a separate agent runtime.
 */

/**
 * Allowlist entry shape. Two forms accepted for back-compat:
 *   - bare string pubkey (legacy) → treated as { merchant, capabilityHashHex: null }
 *   - object form (preferred) → { merchant, capabilityHashHex?: 32-byte hex }
 *
 * When `capabilityHashHex` is present, the on-chain spend rejects any spend whose
 * capability hash doesn't match exactly. Pinning is the strongest custody control: an
 * allowlisted merchant whose capability hash you didn't pin can be paid for any
 * service you authorize via off-chain agent signature; an allowlisted merchant with a
 * pinned capability hash can ONLY be paid for that exact pinned spec.
 */
const AllowlistEntrySchema = z.union([
  z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  z.object({
    merchant: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
    capabilityHashHex: z
      .string()
      .regex(/^[0-9a-fA-F]{64}$/)
      .optional(),
  }),
]);

const BodySchema = z.object({
  authority: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  /** Client-supplied agent pubkey (preferred). Omit to opt into server-generated mode. */
  agent_pubkey: z
    .string()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/)
    .optional(),
  label: z.string().min(1).max(64),
  dailyCapUsdc: z.string().regex(/^\d+(\.\d{1,6})?$/),
  perCallMaxUsdc: z.string().regex(/^\d+(\.\d{1,6})?$/),
  merchantAllowlist: z.array(AllowlistEntrySchema).min(1).max(10),
  expiryDays: z.number().int().min(1).max(365),
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

  const parse = BodySchema.safeParse(raw);
  if (!parse.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parse.error.issues },
      { status: 400 },
    );
  }
  const body = parse.data;

  if (parseFloat(body.perCallMaxUsdc) > parseFloat(body.dailyCapUsdc)) {
    return NextResponse.json(
      { error: "per_call_max_exceeds_daily_cap" },
      { status: 400 },
    );
  }

  const authority = new PublicKey(body.authority);
  const labelHash = labelHashBytes(body.label);
  const [cardPda] = findAgentCardPda(authority, labelHash);

  const dailyCap = BigInt(Math.round(parseFloat(body.dailyCapUsdc) * 1_000_000));
  const perCallMax = BigInt(Math.round(parseFloat(body.perCallMaxUsdc) * 1_000_000));

  // Mode select: client-supplied agent_pubkey wins; otherwise server generates.
  let agentPubkey: PublicKey;
  let agentSecretB58: string | null = null;
  let mode: "client_supplied" | "server_generated";
  if (body.agent_pubkey) {
    try {
      agentPubkey = new PublicKey(body.agent_pubkey);
    } catch {
      return NextResponse.json({ error: "invalid_agent_pubkey" }, { status: 400 });
    }
    mode = "client_supplied";
  } else {
    const fresh = Keypair.generate();
    agentPubkey = fresh.publicKey;
    const bs58 = (await import("bs58")).default;
    agentSecretB58 = bs58.encode(fresh.secretKey);
    mode = "server_generated";
  }

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const currentSlot = await connection.getSlot("confirmed");
  const expirySlot = BigInt(currentSlot + body.expiryDays * 216_000);

  const usdcMint = new PublicKey(getUsdcMint());

  // Normalize allowlist: accept legacy string entries or the object form.
  const normalizedAllowlist = body.merchantAllowlist.map((entry) => {
    if (typeof entry === "string") {
      return { merchant: new PublicKey(entry), capabilityHash: null as Uint8Array | null };
    }
    return {
      merchant: new PublicKey(entry.merchant),
      capabilityHash: entry.capabilityHashHex
        ? new Uint8Array(Buffer.from(entry.capabilityHashHex, "hex"))
        : null,
    };
  });

  const ix = createCardIx({
    authority,
    card: cardPda,
    usdcMint,
    args: {
      agentPubkey,
      labelHash,
      dailyCapLamports: dailyCap,
      perCallMaxLamports: perCallMax,
      allowlist: normalizedAllowlist,
      expirySlot,
      policyVersion: 1,
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
    mode,
    transaction: txBase64,
    card_pubkey: cardPda.toBase58(),
    agent_pubkey: agentPubkey.toBase58(),
    // Only present in server-generated mode. NULL in client-supplied mode (the agent
    // privkey was never on this server).
    ...(agentSecretB58 ? { agent_secret_b58: agentSecretB58 } : {}),
    daily_cap_lamports: dailyCap.toString(),
    per_call_max_lamports: perCallMax.toString(),
    expiry_slot: expirySlot.toString(),
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    message: `Create AgentCard "${body.label}". Daily cap $${body.dailyCapUsdc}, per-call max $${body.perCallMaxUsdc}, ${body.merchantAllowlist.length} merchants, expires in ${body.expiryDays}d. (mode: ${mode})`,
  });
}
