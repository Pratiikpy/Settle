// On-chain program ids used by the Ika sidetrack.
//
// Phase A: the router program id is a placeholder. Replaced after Phase A
// deploy via `solana address -k programs-ika/keys/dwallet_router-keypair.json`.
//
// All ids accept env-var override so devnet, localnet, and future networks
// can be swapped without code changes.

/**
 * Ika dWallet program id on devnet.
 *
 * Source: ika-pre-alpha README. Pinned for the pre-alpha cluster; if Ika
 * Alpha 1 ships a new id we point `NEXT_PUBLIC_IKA_PROGRAM_ID` at it.
 */
export const IKA_DWALLET_PROGRAM_ID =
  process.env.NEXT_PUBLIC_IKA_PROGRAM_ID ??
  "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY";

/**
 * Settle dWallet router program id (sibling Anchor 1.0 program in
 * `programs-ika/`).
 *
 * Phase A placeholder; bump via env after deploy.
 */
export const SETTLE_DWALLET_ROUTER_PROGRAM_ID =
  process.env.NEXT_PUBLIC_SETTLE_DWALLET_ROUTER_PROGRAM_ID ??
  "D1WaLLetRouterProgRamID11111111111111111111";

/**
 * Ika gRPC endpoint for DKG and signing.
 *
 * Pre-alpha: signing uses a single mock signer, not real distributed MPC.
 * Surfaced honestly to users in the product UI (pre-alpha banner).
 */
export const IKA_GRPC_ENDPOINT =
  process.env.NEXT_PUBLIC_IKA_GRPC_ENDPOINT ??
  "https://pre-alpha-dev-1.ika.ika-network.net:443";
