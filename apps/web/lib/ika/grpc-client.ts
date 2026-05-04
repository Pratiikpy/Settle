// Ika gRPC-Web client wrapper.
//
// Phase A: stub. Phase D imports `@connectrpc/connect-web` and the protobuf-ts
// generated bindings from the ika-pre-alpha repo and wires SubmitTransaction.
//
// Pattern reference: chains/solana/examples/multisig/react/src/lib/program.ts
// in resources/identity/ika-pre-alpha.

import { IKA_GRPC_ENDPOINT } from "./program-ids";

/**
 * Build a gRPC-Web transport for the Ika SubmitTransaction service.
 *
 * Phase D will fill this in. In the meantime calling `submitTransaction` from
 * Phase D code throws a clearly-labelled error so a stub never silently passes
 * tests.
 */
export function getIkaTransport(): unknown {
  throw new Error(
    `[ika/grpc-client] not yet implemented (Phase D). endpoint=${IKA_GRPC_ENDPOINT}`,
  );
}
