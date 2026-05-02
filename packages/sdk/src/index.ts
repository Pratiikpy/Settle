export * from "@settle/types";
export * from "./canonical.js";
export * from "./verify-receipt.js";
export * from "./receipt-builder.js";
export * from "./receipt-kernel.js";
export * from "./pdas.js";
export * from "./handles.js";
export * from "./idl.js";
export * from "./webhook-verify.js";
export * from "./sealed-box.js";
export * from "./capability-hash.js";
export * from "./locale.js";
export * from "./graphql-client.js";
export * from "./intent-parse.js";
export * from "./preflight-status.js";
// AU-01-003 — byte-level Anchor ix-data builder is now part of the SDK
// (previously lived only in apps/web/lib/borsh.ts). External SDK consumers
// can build Anchor ix data via `buildIxData("create_card", w => …)`
// without depending on internal app code. Wrapping the bytes into a
// TransactionInstruction still requires the consumer's own @solana/web3.js
// import + their programId — those stay app-side.
export * from "./borsh.js";

// AU-01-004 fix — SDK_VERSION should match package.json. Bumped both to 0.2.0.
export const SDK_VERSION = "0.2.0";
