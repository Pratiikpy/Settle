/**
 * MPL Core soulbound-badge mint helper — server-only.
 *
 * Lives in the indexer (not @settle/sdk, not @settle/types) because:
 *   1. MPL Core SDK is heavy (~600 KB) — doesn't belong in the browser-side
 *      SDK or in @settle/types (which the SDK and edge runtimes import).
 *   2. The web app never mints — only the badge-cron does. The /at/[handle]
 *      view just reads from Supabase + Solscan.
 *   3. Co-locating with badge-cron.ts keeps the cron self-contained: one
 *      service, one rootDir, no cross-app imports.
 *
 * What "soulbound" means here: we attach a `PermanentFreezeDelegate` plugin
 * with `frozen: true` at create-time. This is an *authority-managed,
 * create-only* plugin in MPL Core V2 — once set, it cannot be removed. The
 * recipient owns the asset (so it shows up in their wallet / on Solscan)
 * but cannot transfer or burn it. That's the closest thing on Solana to a
 * true SBT without forking the program.
 *
 * Design notes:
 *   - We DO NOT use a Collection. Each badge is a standalone asset. This
 *     means slightly higher rent per mint but zero collection-management
 *     overhead and no risk of authority confusion.
 *   - Metadata is a `data:application/json` URI embedded directly. No IPFS,
 *     no Arweave, no off-chain storage to keep alive. Trade-off: ~600 bytes
 *     of metadata baked into the on-chain URI field. Worth it for a hackathon
 *     demo where "this still works in 5 years" matters more than "smallest
 *     possible asset."
 *   - The badge-authority keypair (SETTLE_BADGE_AUTHORITY_PRIVKEY) must hold
 *     enough SOL on the target cluster to pay rent + fees. ~0.003 SOL per
 *     mint on devnet.
 */

import { create, mplCore } from "@metaplex-foundation/mpl-core";
import {
  generateSigner,
  keypairIdentity,
  publicKey as umiPublicKey,
  type Umi,
} from "@metaplex-foundation/umi";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import bs58 from "bs58";
import { BADGE_CATALOGUE, type BadgeKind } from "@settle/types";

/**
 * Build a Umi instance signed by the badge-authority keypair, ready to mint.
 * Reads SETTLE_BADGE_AUTHORITY_PRIVKEY from env (base58 64-byte secret).
 */
export function buildBadgeAuthorityUmi(rpcUrl: string): Umi {
  const privBase58 = process.env.SETTLE_BADGE_AUTHORITY_PRIVKEY;
  if (!privBase58) {
    throw new Error(
      "SETTLE_BADGE_AUTHORITY_PRIVKEY missing. Generate via `pnpm badge:keygen`.",
    );
  }
  const secret = bs58.decode(privBase58);
  if (secret.length !== 64) {
    throw new Error(
      `SETTLE_BADGE_AUTHORITY_PRIVKEY must be a 64-byte base58 secret (got ${secret.length})`,
    );
  }

  const umi = createUmi(rpcUrl).use(mplCore());
  const kp = umi.eddsa.createKeypairFromSecretKey(secret);
  return umi.use(keypairIdentity(kp));
}

/**
 * Produce a `data:application/json;base64,...` URI describing this badge.
 * The MPL Core asset's `uri` field points here; wallets and explorers fetch
 * it to render name/description/image.
 *
 * For the image: we use a tiny inline SVG so the entire badge is self-
 * contained on chain. The SVG renders the emoji centered on a gradient.
 */
export function buildBadgeMetadataDataUri(
  kind: BadgeKind,
  recipientPubkey: string,
): string {
  const spec = BADGE_CATALOGUE[kind];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><defs><radialGradient id="g" cx="50%" cy="40%" r="60%"><stop offset="0%" stop-color="#1a1a2e"/><stop offset="100%" stop-color="#000"/></radialGradient></defs><rect width="256" height="256" fill="url(#g)"/><text x="128" y="160" font-size="120" text-anchor="middle" dominant-baseline="middle">${spec.emoji}</text><text x="128" y="220" font-size="14" font-family="ui-monospace,monospace" fill="#fff" text-anchor="middle" opacity="0.7">${spec.name}</text></svg>`;
  const imageDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  const metadata = {
    name: spec.name,
    symbol: "SETTLE",
    description: spec.description,
    image: imageDataUri,
    external_url: `https://settle.so/at/${recipientPubkey}`,
    attributes: [
      { trait_type: "Badge", value: spec.name },
      { trait_type: "Threshold", value: spec.threshold },
      { trait_type: "Kind", value: kind },
      { trait_type: "Soulbound", value: "true" },
    ],
    properties: {
      category: "image",
    },
  };
  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;
}

export interface MintSoulboundBadgeArgs {
  umi: Umi;
  recipientPubkey: string;
  badgeKind: BadgeKind;
}

export interface MintSoulboundBadgeResult {
  asset_address: string;
  metadata_uri: string;
  signature: string;
}

/**
 * Mint a soulbound badge to the recipient. Returns the new asset address +
 * the data: URI we used + the tx signature.
 *
 * The PermanentFreezeDelegate plugin with frozen=true is set at create time
 * with the *recipient* as the authority of that plugin (owner-managed control
 * over freeze status — but since it's "Permanent" the freeze itself can never
 * be removed; the authority field just controls future unfreeze attempts which
 * the program rejects anyway).
 *
 * Wait — read the plugin types again. PermanentFreezeDelegate is in the
 * CreateOnlyPluginArgsV2 union, meaning it's locked at create time. The
 * `authority` we pass via AuthorityArgsV2 controls who can update the plugin
 * config later, but for a "permanent" plugin that update path is gated by the
 * program. We set authority to the badge-authority (us) so nothing the
 * recipient does can affect it.
 */
export async function mintSoulboundBadge(
  args: MintSoulboundBadgeArgs,
): Promise<MintSoulboundBadgeResult> {
  const { umi, recipientPubkey, badgeKind } = args;
  const spec = BADGE_CATALOGUE[badgeKind];
  const metadataUri = buildBadgeMetadataDataUri(badgeKind, recipientPubkey);

  const assetSigner = generateSigner(umi);
  const owner = umiPublicKey(recipientPubkey);

  const builder = create(umi, {
    asset: assetSigner,
    name: spec.name,
    uri: metadataUri,
    owner,
    plugins: [
      {
        type: "PermanentFreezeDelegate",
        frozen: true,
      },
    ],
  });

  const { signature } = await builder.sendAndConfirm(umi, {
    confirm: { commitment: "confirmed" },
  });

  return {
    asset_address: assetSigner.publicKey.toString(),
    metadata_uri: metadataUri,
    signature: bs58.encode(signature),
  };
}
