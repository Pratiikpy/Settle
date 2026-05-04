// Shared types for the Ika sidetrack web glue.
//
// Plain TypeScript types. No runtime imports. Anything that touches Solana,
// fetch, or gRPC lives in its dedicated module.

/** CAIP-2 chain identifier, e.g. "eip155:11155111", "bip122:000000000019d6...".
 *  Validated by the Zod schema in `@settle/sdk` for receipt rows. */
export type CaipChainId = string & { readonly __brand: "CaipChainId" };

/** CAIP-10 account identifier: `<chain>:<address>`. */
export type CaipAccountId = string & { readonly __brand: "CaipAccountId" };

/** A 32-byte keccak256 digest, lowercase hex without 0x prefix. */
export type Keccak256Hex = string & { readonly __brand: "Keccak256Hex" };

/** Recipient kind tag (matches `state::CrosschainAllowlistEntry::recipient_kind`). */
export type RecipientKind = 0 | 1 | 2 | 3;

/** Asset kind tag (matches `state::CrosschainAllowlistEntry::asset_kind`). */
export type AssetKind = 0 | 1 | 2 | 3;

export interface CrosschainAddress {
  chain: CaipChainId;
  recipientKind: RecipientKind;
  recipient: string; // chain-native string form (e.g. "0xabc..." for EVM)
}

export interface AllowlistEntry {
  chain: CaipChainId;
  recipient: CrosschainAddress;
  assetKind: AssetKind;
  asset: string | null; // contract addr for ERC20, mint for SPL, null for native
  capabilityHash: Keccak256Hex | null;
}

export interface ChainRegistryEntry {
  caipChainId: CaipChainId;
  displayName: string;
  /** Decimal places for the chain-native unit (18 = ETH, 8 = BTC, 9 = SOL). */
  nativeDecimals: number;
  /** Pre-built explorer URL builder for tx hashes. */
  explorerTxUrl: (txHash: string) => string;
  /** Validates a chain-native address string (e.g. EIP-55 for EVM). */
  isValidAddress: (s: string) => boolean;
  /** Default RPC URL hint (server-side only; do not import from browser). */
  defaultRpcUrlEnvVar: string;
}
