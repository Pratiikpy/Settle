import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, clusterApiUrl } from "@solana/web3.js";
import { z } from "zod";
import {
  findAgentCardPda,
  findPactPda,
  findPactVaultPda,
  labelHashBytes,
  openPactIx,
} from "../../../../lib/anchor-client";
import { getUsdcMint } from "../../../../lib/solana";

export const runtime = "nodejs";

/**
 * POST /api/agents/spawn — opens + funds a Pact in a single signed tx.
 *
 * body: {
 *   authority: pubkey,
 *   parentCardLabel: string,    // e.g. "main"
 *   scopeLabel: string,         // e.g. "research-2026-04-30T..."
 *   capUsdc: string,            // decimal e.g. "0.50" — also the funding amount
 *   merchantAllowlist: [
 *     { merchant: pubkey, capabilityHashHex?: string }
 *   ],
 *   expiryMinutes: number,      // 1..1440
 * }
 *
 * Response:
 *   { transaction: base64, pact: pubkey, vault: pubkey, parent_card: pubkey }
 *
 * Phantom signs + submits. The single tx:
 *   - Creates the Pact PDA
 *   - Initializes the Vault USDC ATA
 *   - Transfers `capUsdc` USDC from authority → vault ATA (TransferChecked)
 *
 * After confirmation, the agent (= card.agent_pubkey holder) can autonomously call
 * `spend_via_pact` until the cap is exhausted, the pact expires, or the user closes it.
 */

const AllowlistEntrySchema = z.object({
  merchant: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  capabilityHashHex: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
});

const BodySchema = z.object({
  authority: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/),
  parentCardLabel: z.string().min(1).max(64),
  scopeLabel: z.string().min(1).max(64),
  capUsdc: z.string().regex(/^\d+(\.\d{1,6})?$/),
  // Backward-compat: still accept a flat list of pubkeys; or rich entries.
  merchantAllowlist: z
    .union([
      z
        .array(z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/))
        .min(1)
        .max(5),
      z.array(AllowlistEntrySchema).min(1).max(5),
    ])
    .transform((v) =>
      typeof v[0] === "string"
        ? (v as string[]).map((m) => ({ merchant: m, capabilityHashHex: undefined }))
        : (v as Array<z.infer<typeof AllowlistEntrySchema>>),
    ),
  expiryMinutes: z.number().int().min(1).max(1440),
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

  const authority = new PublicKey(body.authority);
  const parentCardLabel = labelHashBytes(body.parentCardLabel);
  const scopeLabel = labelHashBytes(body.scopeLabel);

  const [parentCardPda] = findAgentCardPda(authority, parentCardLabel);
  const [pactPda] = findPactPda(parentCardPda, scopeLabel);
  const [vaultPda] = findPactVaultPda(pactPda);

  const decimal = parseFloat(body.capUsdc);
  const capLamports = BigInt(Math.round(decimal * 1_000_000));

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });
  const currentSlot = await connection.getSlot("confirmed");
  const expirySlot = BigInt(currentSlot + body.expiryMinutes * 150);

  const usdcMint = new PublicKey(getUsdcMint());

  const ix = openPactIx({
    authority,
    parentCard: parentCardPda,
    pact: pactPda,
    usdcMint,
    args: {
      scopeLabelHash: scopeLabel,
      capLamports,
      allowlist: body.merchantAllowlist.map((entry) => ({
        merchant: new PublicKey(entry.merchant),
        capabilityHash: entry.capabilityHashHex
          ? Buffer.from(entry.capabilityHashHex, "hex")
          : null,
      })),
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
    pact: pactPda.toBase58(),
    vault: vaultPda.toBase58(),
    parent_card: parentCardPda.toBase58(),
    expiry_slot: expirySlot.toString(),
    cap_lamports: capLamports.toString(),
    blockhash,
    last_valid_block_height: lastValidBlockHeight,
    message: `Open + fund Pact (cap $${body.capUsdc} USDC, ${body.merchantAllowlist.length} merchants, ${body.expiryMinutes}m). Sign to authorize the funding transfer.`,
  });
}
