// Re-export from @settle/sdk so the proxy and demo-agent compute identical hashes.
// Single source of truth: packages/sdk/src/capability-hash.ts.
export {
  computeCapabilityHashHex,
  type CapabilitySpec,
} from "@settle/sdk";
