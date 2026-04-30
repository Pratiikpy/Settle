import { Connection, clusterApiUrl } from "@solana/web3.js";

/**
 * Solana RPC connection singleton.
 *
 * We use Helius if HELIUS_API_KEY is configured, fallback to public devnet otherwise.
 * @solana/kit v3 is installed for Codama-generated client interop, but for transaction
 * building + SPL token + Solana Pay we use @solana/web3.js (v1.95.x) because the broader
 * ecosystem libraries still target it. Both can coexist.
 */

const NETWORK = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet") as
  | "mainnet"
  | "devnet"
  | "testnet";

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;

  const heliusKey = process.env.NEXT_PUBLIC_HELIUS_API_KEY ?? process.env.HELIUS_API_KEY;
  if (heliusKey) {
    const host = NETWORK === "mainnet" ? "mainnet" : "devnet";
    return `https://${host}.helius-rpc.com/?api-key=${heliusKey}`;
  }

  return clusterApiUrl(NETWORK === "mainnet" ? "mainnet-beta" : NETWORK);
}

let _connection: Connection | null = null;

export function getConnection(): Connection {
  if (_connection) return _connection;
  _connection = new Connection(getRpcUrl(), {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
  });
  return _connection;
}

export const NETWORK_NAME = NETWORK;

/** USDC mint addresses. Devnet uses Circle's devnet USDC. */
export const USDC_MINT = {
  mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
} as const;

export function getUsdcMint(): string {
  return NETWORK === "mainnet" ? USDC_MINT.mainnet : USDC_MINT.devnet;
}

/** Convenience: Solscan URL builder honoring current cluster. */
export function getSolscanUrl(sig: string): string {
  const cluster = NETWORK === "mainnet" ? "" : `?cluster=${NETWORK}`;
  return `https://solscan.io/tx/${sig}${cluster}`;
}

export function getSolscanAccountUrl(pubkey: string): string {
  const cluster = NETWORK === "mainnet" ? "" : `?cluster=${NETWORK}`;
  return `https://solscan.io/account/${pubkey}${cluster}`;
}
