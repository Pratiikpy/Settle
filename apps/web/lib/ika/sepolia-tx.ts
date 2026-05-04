// Settle x Ika sidetrack — Sepolia tx helpers (re-exported from `@settle/sdk`).
//
// The pure RLP + EIP-1559 implementation lives in
// `packages/sdk/src/eip1559.ts` so it can be unit-tested under vitest in the
// SDK package. This file is a thin re-export so existing imports like
// `import { buildUnsignedSepoliaTxDigest } from "../../lib/ika/sepolia-tx"`
// keep working in the web app.

export {
  bigIntToMinimalBytes,
  buildSignedSepoliaTx,
  buildUnsignedSepoliaTxDigest,
  bytesToHex,
  evmAddressBytes,
  hexToBytes0x as hexToBytes,
  rlpBytes,
  rlpList,
} from "@settle/sdk";
export type { UnsignedSepoliaTx } from "@settle/sdk";
