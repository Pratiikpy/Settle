#!/usr/bin/env tsx
/**
 * Emits hex-encoded ix data bytes from the TS reference for the same
 * inputs the Rust crate's ix_data tests use. Locks the byte-level
 * parity between TS anchor-client and Rust ix_data modules.
 *
 * Run:
 *   pnpm --filter @settle/sdk build  (if not already built)
 *   pnpm tsx scripts/smoke-ix-data-parity.ts
 *
 * Compare against `cargo test --manifest-path packages/rust-sdk/Cargo.toml`
 * — the Rust tests assert byte counts that match these.
 */

import { buildIxData } from "../apps/web/lib/borsh.js";

function dump(label: string, bytes: Buffer) {
  console.log(`${label.padEnd(28)} (${bytes.length}b): ${bytes.toString("hex")}`);
}

// 1. revoke — empty body
dump("revoke", buildIxData("revoke", () => {}));

// 2. close_pact — empty body
dump("close_pact", buildIxData("close_pact", () => {}));

// 3. spend with sentinel hashes
const spendBytes = buildIxData("spend", (w) => {
  w.u64(0x123456789abcdef0n);
  w.fixedBytes(new Uint8Array(32).fill(0x11), 32);
  w.fixedBytes(new Uint8Array(32).fill(0x22), 32);
  w.fixedBytes(new Uint8Array(32).fill(0x33), 32);
  w.fixedBytes(new Uint8Array(32).fill(0x44), 32);
});
dump("spend", spendBytes);

// 4. spend_via_pact with same args (shape parity)
const svpBytes = buildIxData("spend_via_pact", (w) => {
  w.u64(0x123456789abcdef0n);
  w.fixedBytes(new Uint8Array(32).fill(0x11), 32);
  w.fixedBytes(new Uint8Array(32).fill(0x22), 32);
  w.fixedBytes(new Uint8Array(32).fill(0x33), 32);
  w.fixedBytes(new Uint8Array(32).fill(0x44), 32);
});
dump("spend_via_pact", svpBytes);

// 5. open_pact with one allowlist entry, no capability hash
const openPactBytes = buildIxData("open_pact", (w) => {
  w.fixedBytes(new Uint8Array(32).fill(0xab), 32);
  w.u64(1_000_000n);
  w.vec(
    [{ merchant: new Uint8Array(32).fill(0xcd), capabilityHash: null }],
    (ww, e) => {
      ww.fixedBytes(e.merchant, 32);
      ww.option(e.capabilityHash, (www, h) => www.fixedBytes(h, 32));
    },
  );
  w.u64(12345n);
});
dump("open_pact", openPactBytes);

// 6. create_card with two allowlist entries — one None, one Some
const createCardBytes = buildIxData("create_card", (w) => {
  w.fixedBytes(new Uint8Array(32).fill(0x01), 32);
  w.fixedBytes(new Uint8Array(32).fill(0x02), 32);
  w.u64(100_000_000n);
  w.u64(5_000_000n);
  w.vec(
    [
      { merchant: new Uint8Array(32).fill(0x03), capabilityHash: null },
      {
        merchant: new Uint8Array(32).fill(0x04),
        capabilityHash: new Uint8Array(32).fill(0x05),
      },
    ],
    (ww, e) => {
      ww.fixedBytes(e.merchant, 32);
      ww.option(e.capabilityHash, (www, h) => www.fixedBytes(h, 32));
    },
  );
  w.u64(10_000n);
  w.u32(1);
});
dump("create_card", createCardBytes);

// ─── streaming + escrow ix builders (Rust extension) ───

// 7. open_streaming_pact
const openStream = buildIxData("open_streaming_pact", (w) => {
  w.fixedBytes(new Uint8Array(32).fill(0xa1), 32);
  w.u64(100n); // rate_lamports_per_slot
  w.u64(1_000_000n); // max_total_lamports
  w.vec(
    [{ merchant: new Uint8Array(32).fill(0xb1), capabilityHash: null }],
    (ww, e) => {
      ww.fixedBytes(e.merchant, 32);
      ww.option(e.capabilityHash, (www, h) => www.fixedBytes(h, 32));
    },
  );
  w.u64(99999n);
});
dump("open_streaming_pact", openStream);

// 8. claim_streaming
const claimStream = buildIxData("claim_streaming", (w) => {
  w.fixedBytes(new Uint8Array(32).fill(0xc1), 32);
  w.fixedBytes(new Uint8Array(32).fill(0xc2), 32);
  w.fixedBytes(new Uint8Array(32).fill(0xc3), 32);
  w.fixedBytes(new Uint8Array(32).fill(0xc4), 32);
});
dump("claim_streaming", claimStream);

// 9. pause_streaming
dump("pause_streaming", buildIxData("pause_streaming", () => {}));

// 10. resume_streaming
dump("resume_streaming", buildIxData("resume_streaming", () => {}));

// 11. open_delivery_escrow
const openEscrow = buildIxData("open_delivery_escrow", (w) => {
  w.fixedBytes(new Uint8Array(32).fill(0xd1), 32);
  w.u64(500n);
  w.fixedBytes(new Uint8Array(32).fill(0xd2), 32);
  w.fixedBytes(new Uint8Array(32).fill(0xd3), 32);
  w.u64(1000n);
  w.u64(2000n);
  w.u64(3000n);
});
dump("open_delivery_escrow", openEscrow);

// 12. release_delivery_escrow
dump("release_delivery_escrow", buildIxData("release_delivery_escrow", () => {}));

// 13. dispute_delivery_escrow
dump("dispute_delivery_escrow", buildIxData("dispute_delivery_escrow", () => {}));

// 14. record_denial — AU-03-008: was missing from smoke harness pre-fix.
dump(
  "record_denial",
  buildIxData("record_denial", (w) => {
    w.u8(1);
    w.fixedBytes(new Uint8Array(32).fill(0xaa), 32);
    w.fixedBytes(new Uint8Array(32).fill(0xbb), 32);
    w.fixedBytes(new Uint8Array(32).fill(0xcc), 32);
    w.fixedBytes(new Uint8Array(32).fill(0xdd), 32);
    w.fixedBytes(new Uint8Array(32).fill(0xee), 32);
  }),
);

// 15. record_receipt — AU-03-008
dump(
  "record_receipt",
  buildIxData("record_receipt", (w) => {
    w.u8(0);
    w.fixedBytes(new Uint8Array(32).fill(0x11), 32);
    w.fixedBytes(new Uint8Array(32).fill(0x22), 32);
    w.fixedBytes(new Uint8Array(32).fill(0x33), 32);
    w.fixedBytes(new Uint8Array(32).fill(0x44), 32);
    w.fixedBytes(new Uint8Array(32).fill(0x55), 32);
  }),
);

console.log("\nByte counts assertion targets for Rust ix_data tests:");
console.log("  revoke:         8");
console.log("  close_pact:     8");
console.log("  spend:          144  (8 disc + 8 amt + 4×32 hashes)");
console.log("  spend_via_pact: 144");
console.log("  open_pact:      93   (8 + 32 + 8 + 4 + 33 + 8)");
console.log("  create_card:    202  (8 + 32 + 32 + 8 + 8 + 4 + 33 + 65 + 8 + 4)");
console.log("  record_denial:  169  (8 + 1 + 5×32)");
console.log("  record_receipt: 169  (8 + 1 + 5×32)");
