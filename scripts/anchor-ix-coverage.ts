#!/usr/bin/env tsx
/**
 * Section 23 — Anchor ix coverage.
 * Verifies the IDL exposes all 14 expected instructions.
 */
import { SETTLE_IDL as IDL } from "@settle/sdk";

const EXPECTED = [
  "create_card",
  "revoke",
  "open_pact",
  "close_pact",
  "spend",
  "spend_via_pact",
  "open_streaming_pact",
  "claim_streaming",
  "pause_streaming",
  "resume_streaming",
  "open_delivery_escrow",
  "release_delivery_escrow",
  "dispute_delivery_escrow",
  "record_receipt",
];

const camelExpected = EXPECTED.map((s) => s.replace(/_(.)/g, (_, c) => c.toUpperCase()));

async function main() {
  const ixs = (IDL as any).instructions ?? [];
  console.log(`# anchor-ix-coverage — IDL has ${ixs.length} instructions`);
  let pass = 0;
  let fail = 0;
  const found = new Set<string>(ixs.map((i: any) => i.name));
  for (const ix of camelExpected) {
    if (found.has(ix) || found.has(ix.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase()).replace(/^_/, ""))) {
      console.log(`✓ ${ix}`);
      pass++;
    } else {
      console.log(`✗ ${ix} — MISSING from IDL`);
      fail++;
    }
  }
  console.log(`\nTotal: ${pass} pass / ${fail} fail`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
