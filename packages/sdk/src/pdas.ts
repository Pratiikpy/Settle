/**
 * PDA derivation helpers — match the seeds in `programs/settle-agent-card/src/state.rs`.
 *
 * AgentCard PDA:    seeds = [b"agent-card", authority, label_hash]
 * Pact PDA:         seeds = [b"pact", parent_card, scope_label_hash]
 * Pact Vault PDA:   seeds = [b"pact-vault", pact]   ← owns the Pact's USDC ATA
 *
 * NOTE: We avoid pulling in @solana/kit at SDK-load time. These helpers operate on raw
 * bytes and return seed arrays that the caller pairs with their Solana client of choice.
 */
import { blake3 } from "@noble/hashes/blake3";

export const AGENT_CARD_SEED = new TextEncoder().encode("agent-card");
export const PACT_SEED = new TextEncoder().encode("pact");
export const PACT_VAULT_SEED = new TextEncoder().encode("pact-vault");

export function labelHash(label: string): Uint8Array {
  return blake3(new TextEncoder().encode(label));
}

export interface PdaSeeds {
  seeds: Uint8Array[];
}

export function agentCardSeeds(authorityPubkey: Uint8Array, labelHashBytes: Uint8Array): PdaSeeds {
  if (authorityPubkey.length !== 32) throw new Error("authorityPubkey must be 32 bytes");
  if (labelHashBytes.length !== 32) throw new Error("labelHashBytes must be 32 bytes");
  return { seeds: [AGENT_CARD_SEED, authorityPubkey, labelHashBytes] };
}

export function pactSeeds(parentCardPubkey: Uint8Array, scopeLabelHashBytes: Uint8Array): PdaSeeds {
  if (parentCardPubkey.length !== 32) throw new Error("parentCardPubkey must be 32 bytes");
  if (scopeLabelHashBytes.length !== 32) throw new Error("scopeLabelHashBytes must be 32 bytes");
  return { seeds: [PACT_SEED, parentCardPubkey, scopeLabelHashBytes] };
}

export function pactVaultSeeds(pactPubkey: Uint8Array): PdaSeeds {
  if (pactPubkey.length !== 32) throw new Error("pactPubkey must be 32 bytes");
  return { seeds: [PACT_VAULT_SEED, pactPubkey] };
}
