import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { fetchAgentCard } from "../../../../../lib/account-decoder";
import { detectSquadsMultisig } from "../../../../../lib/squads";

export const runtime = "nodejs";

/**
 * GET /api/cards/[id]/authority-info
 *
 * Returns metadata about the card's authority — most importantly whether it's a Squads
 * multisig PDA. Used by /cards/[id] UI to show "Team-managed card · X-of-Y" badge.
 */

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(id)) {
    return NextResponse.json({ error: "invalid_card_id" }, { status: 400 });
  }

  const connection = new Connection(getRpcUrl(), { commitment: "confirmed" });

  try {
    const card = await fetchAgentCard(connection, new PublicKey(id));
    if (!card) {
      return NextResponse.json({ error: "card_not_found" }, { status: 404 });
    }

    const squads = await detectSquadsMultisig(connection, card.authority);

    return NextResponse.json({
      ok: true,
      card_pubkey: id,
      authority: card.authority.toBase58(),
      agent_pubkey: card.agentPubkey.toBase58(),
      is_squads_multisig: squads.isMultisig,
      ...(squads.programOwner ? { authority_program_owner: squads.programOwner } : {}),
      revoked: card.revoked,
      policy_version: card.policyVersion,
    });
  } catch (e) {
    return NextResponse.json(
      { error: "fetch_failed", message: (e as Error).message },
      { status: 500 },
    );
  }
}
