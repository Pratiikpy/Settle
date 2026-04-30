/**
 * Squads V4 multisig integration — detect if a card.authority is a Squads-managed PDA.
 *
 * Squads V4: SQDS5BiqzNmSBEFn1Bnp1KMvTdg9F5BbKYLg1QBcgY1F (mainnet + devnet)
 * Multisig PDA seeds: [b"multisig", create_key]
 *
 * For Settle V1, we surface this via UI: if `card.authority` is a Squads multisig PDA, the
 * card detail page shows "Team-managed card · X-of-Y signers" instead of "Personal card".
 *
 * Spend/revoke flows for Squads-managed cards must go through the Squads proposal process
 * (not directly through Settle's facilitator). V1 detects + UI-surfaces this; V2 wires the
 * Squads SDK to build proposal txs.
 */

import { Connection, PublicKey } from "@solana/web3.js";

export const SQUADS_PROGRAM_ID = new PublicKey("SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf");

/**
 * Best-effort detection: fetch the authority account, check if it's owned by the Squads program.
 * Returns null if not Squads-managed; otherwise returns the multisig PDA pubkey.
 */
export async function detectSquadsMultisig(
  connection: Connection,
  authority: PublicKey,
): Promise<{ isMultisig: boolean; programOwner?: string }> {
  try {
    const info = await connection.getAccountInfo(authority, "confirmed");
    if (!info) return { isMultisig: false };
    const isSquads = info.owner.equals(SQUADS_PROGRAM_ID);
    return {
      isMultisig: isSquads,
      ...(isSquads ? { programOwner: info.owner.toBase58() } : {}),
    };
  } catch {
    return { isMultisig: false };
  }
}
