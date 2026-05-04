// Settle x Ika sidetrack — web glue.
//
// Phase A: directory exists; full implementations land in Phase D.
//
// Module map (in build order):
//
//   chains.ts        — chain registry (Sepolia day-1; Bitcoin/Sui later)
//   types.ts         — shared types (CAIP-2/CAIP-10 brands, AllowlistEntry, etc.)
//   program-ids.ts   — devnet program ids (Ika dWallet + our settle-dwallet-router)
//   grpc-client.ts   — gRPC-Web wrapper around Ika SubmitTransaction
//   dkg-flow.ts      — full DKG roundtrip
//   sign-flow.ts     — keccak256(tx) -> CPI request -> poll MessageApproval -> fetch sig
//   policy-snapshot.ts — builds the policy_snapshot_hash matching SDK convention
//   broadcast.ts     — broadcasts the signed tx on the target chain
//
// All modules share these constraints:
// - No secrets in browser-imported code (server-route-only modules live under
//   `app/api/crosschain/*` or take an env reference at the entry point).
// - All cross-chain addresses, tx hashes, and amounts use the types from
//   `types.ts`, never raw `string`.

export { sepolia } from "./chains";
export type {
  CaipChainId,
  CaipAccountId,
  ChainRegistryEntry,
  CrosschainAddress,
  AllowlistEntry,
} from "./types";
