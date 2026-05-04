// Chain registry for the Ika sidetrack.
//
// Day-1 scope: Ethereum Sepolia ONLY. Phase D may add Bitcoin signet / Sui
// devnet entries but only once the Sepolia happy-path is verified end-to-end
// against the real Ika gRPC service. Adding chains before that is premature.

import type { CaipChainId, ChainRegistryEntry } from "./types";

const SEPOLIA_CAIP: CaipChainId = "eip155:11155111" as CaipChainId;

/**
 * Ethereum Sepolia. Free public RPC available; we still take a private RPC
 * URL via env to avoid rate-limit surprises during demo.
 *
 * Decimals: 18 (wei). Receipt UI displays `amount_minor` divided by 1e18 with
 * 6 significant figures.
 */
export const sepolia: ChainRegistryEntry = {
  caipChainId: SEPOLIA_CAIP,
  displayName: "Ethereum Sepolia",
  nativeDecimals: 18,
  explorerTxUrl: (txHash) => {
    const clean = txHash.startsWith("0x") ? txHash : `0x${txHash}`;
    return `https://sepolia.etherscan.io/tx/${clean}`;
  },
  isValidAddress: (s) => /^0x[a-fA-F0-9]{40}$/.test(s),
  defaultRpcUrlEnvVar: "SEPOLIA_RPC_URL",
};

/** Lookup by CAIP-2 chain id. Throws when unknown — chain support is allowlisted. */
export function getChainOrThrow(caip: CaipChainId): ChainRegistryEntry {
  if (caip === SEPOLIA_CAIP) return sepolia;
  throw new Error(`unsupported_chain: ${caip}`);
}
