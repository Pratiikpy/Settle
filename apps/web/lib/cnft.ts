/**
 * cNFT receipt minting via Metaplex Bubblegum + Umi.
 *
 * Architecture (per FINAL_LOCKS §11):
 *   - One Metaplex Token Metadata collection: "Settle Receipts"
 *   - One Bubblegum V1 concurrent merkle tree (max_depth 20, canopy 13) ≈ 1M cNFTs at ~8.5 SOL one-time
 *   - On every successful spend (PolicyDecisionEvent::Allow), mint a cNFT to the user's wallet
 *
 * Bubblegum V1 vs V2 note: the on-chain Bubblegum program supports V2 instructions, but the
 * @metaplex-foundation/mpl-bubblegum JS SDK at v4.4.0 only exposes V1 mint helpers
 * (mintToCollectionV1, parseLeafFromMintV1Transaction). V1 trees are widely used in production
 * (Mad Lads, Drip, MonkeDAO). When the SDK exposes V2 helpers, we'll migrate.
 *
 * Setup (run once via `pnpm cnft:setup`):
 *   1. Create Token Metadata collection NFT → save SETTLE_CNFT_COLLECTION_PUBKEY
 *   2. createTree → produces a tree address; save SETTLE_CNFT_TREE_PUBKEY
 *   3. Save tree authority keypair → SETTLE_TREE_AUTHORITY_KEYPAIR_B58
 *
 * Server-only. Node runtime. Add `export const runtime = "nodejs"` to consuming routes.
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  publicKey as umiPublicKey,
  keypairIdentity,
  none,
  type Umi,
} from "@metaplex-foundation/umi";
import {
  mintToCollectionV1,
  parseLeafFromMintToCollectionV1Transaction,
  TokenStandard,
  TokenProgramVersion,
} from "@metaplex-foundation/mpl-bubblegum";
import { mplCore } from "@metaplex-foundation/mpl-core";
import bs58 from "bs58";

export interface CnftMintInput {
  recipient: string;       // base58 pubkey
  merchant: string;        // human-readable merchant name (e.g. "ArxivFetch")
  amountUsdc: string;      // "0.10"
  capabilityHash: string;  // hex
  receiptIndex: number;    // sequential per user
  /** Optional override URI; defaults to the metadata API route. */
  metadataUri?: string;
}

export interface CnftMintResult {
  asset_id: string;
  leaf_index: number;
  tree: string;
  collection: string;
  signature: string;
}

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return cluster === "mainnet"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

let _umi: Umi | null = null;

function getUmi(): Umi {
  if (_umi) return _umi;
  const umi = createUmi(getRpcUrl()).use(mplCore());

  const authorityB58 = process.env.SETTLE_TREE_AUTHORITY_KEYPAIR_B58;
  if (!authorityB58) {
    throw new Error(
      "cnft: SETTLE_TREE_AUTHORITY_KEYPAIR_B58 not set. Run `pnpm cnft:setup` first.",
    );
  }
  const secret = bs58.decode(authorityB58);
  const keypair = umi.eddsa.createKeypairFromSecretKey(secret);
  umi.use(keypairIdentity(keypair));

  _umi = umi;
  return umi;
}

/**
 * Mint a Bubblegum V1 cNFT receipt to the recipient.
 *
 * Returns null silently if cNFT infra isn't configured yet (so the spend flow doesn't
 * fail just because cnft:setup hasn't run). Throws only on real Umi/Solana errors.
 */
export async function mintReceiptCnft(input: CnftMintInput): Promise<CnftMintResult | null> {
  const treeStr = process.env.SETTLE_CNFT_TREE_PUBKEY;
  const collectionStr = process.env.SETTLE_CNFT_COLLECTION_PUBKEY;
  const authorityB58 = process.env.SETTLE_TREE_AUTHORITY_KEYPAIR_B58;
  if (!treeStr || !collectionStr || !authorityB58) {
    // cNFT mint is enrichment, not core — log and skip rather than fail the spend flow.
    console.warn("[cnft] infra not configured — skipping mint (run `pnpm cnft:setup`)");
    return null;
  }

  // mintToCollectionV1 lives under the bubblegum package; load lazily so test envs don't crash.
  const { mplBubblegum } = await import("@metaplex-foundation/mpl-bubblegum");
  const umi = getUmi();
  umi.use(mplBubblegum());

  const tree = umiPublicKey(treeStr);
  const collectionMint = umiPublicKey(collectionStr);
  const recipient = umiPublicKey(input.recipient);

  const metadataUri =
    input.metadataUri ??
    `${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/cnft/${input.receiptIndex}/metadata.json`;

  const builder = mintToCollectionV1(umi, {
    leafOwner: recipient,
    merkleTree: tree,
    collectionMint,
    metadata: {
      name: `Settle Receipt #${input.receiptIndex}`,
      symbol: "SETTLE",
      uri: metadataUri,
      sellerFeeBasisPoints: 0,
      collection: { key: collectionMint, verified: false },
      creators: [],
      primarySaleHappened: false,
      isMutable: false,
      editionNonce: none(),
      tokenStandard: { __option: "Some" as const, value: TokenStandard.NonFungible },
      uses: none(),
      tokenProgramVersion: TokenProgramVersion.Original,
    },
  });

  const result = await builder.sendAndConfirm(umi);

  // Parse the leaf to extract asset_id + leaf_index
  const leaf = await parseLeafFromMintToCollectionV1Transaction(umi, result.signature);

  return {
    asset_id: leaf.id.toString(),
    leaf_index: Number(leaf.nonce), // Bubblegum V1 leaf nonce IS the leaf index
    tree: tree.toString(),
    collection: collectionMint.toString(),
    signature: bs58.encode(result.signature),
  };
}

/**
 * Validate that tree + collection are set up.
 * Used by /api/health to surface readiness.
 */
export function checkCnftSetup(): {
  ready: boolean;
  tree?: string;
  collection?: string;
  reason?: string;
} {
  const tree = process.env.SETTLE_CNFT_TREE_PUBKEY;
  const collection = process.env.SETTLE_CNFT_COLLECTION_PUBKEY;
  const authority = process.env.SETTLE_TREE_AUTHORITY_KEYPAIR_B58;
  if (!tree) return { ready: false, reason: "SETTLE_CNFT_TREE_PUBKEY not set" };
  if (!collection) return { ready: false, reason: "SETTLE_CNFT_COLLECTION_PUBKEY not set" };
  if (!authority) return { ready: false, reason: "SETTLE_TREE_AUTHORITY_KEYPAIR_B58 not set" };
  return { ready: true, tree, collection };
}
