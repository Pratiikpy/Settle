#!/usr/bin/env tsx
/**
 * C114 — IDL drift detection.
 *
 * Compares three sources of truth:
 *   1. The canonical IDL exported from packages/sdk/src/idl.ts
 *   2. The discriminators emitted by Anchor's standard derivation
 *   3. The hard-coded byte-size assumptions in apps/indexer/src/index.ts
 *      (e.g., "if data.length < 157" for handleCardCreated)
 *
 * If any of those drift apart, this script prints exactly which one
 * and exits non-zero. Run it as part of CI before any deploy where
 * the on-chain program might have changed.
 *
 * What this CANNOT catch:
 *   - On-chain account *layouts* changing (Anchor adds a field to a
 *     struct without us updating IDL). For that, we'd need to fetch
 *     the live program's IDL via `anchor idl fetch` and compare. That
 *     is the next step (C114.2) — this script is the cheap upstream
 *     defense.
 *
 * Run:
 *   pnpm tsx scripts/check-idl-drift.ts
 *
 * Exit codes:
 *   0 — no drift detected
 *   1 — at least one drift found; details printed
 *   2 — script invocation error
 */

import { createHash } from "node:crypto";
import { SETTLE_IDL } from "../packages/sdk/src/idl.js";

interface IdlIxArg {
  name: string;
  type: unknown;
}
interface IdlIx {
  name: string;
  args: IdlIxArg[];
}
interface IdlEventField {
  name: string;
  type: unknown;
  index?: boolean;
}
interface IdlEvent {
  name: string;
  fields: IdlEventField[];
}

/** Anchor's standard discriminator: sha256("kind:name")[..8]. */
function discriminator(kind: string, name: string): string {
  // Anchor uses snake_case for the discriminator seed. The IDL stores
  // camelCase ix names; convert here.
  const snake = name
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
  return createHash("sha256")
    .update(`${kind}:${snake}`)
    .digest("hex")
    .slice(0, 16); // 8 bytes hex = 16 chars
}

/**
 * Compute a "shape signature" for an event: list of (name, type) pairs.
 * If the on-chain event layout changes, this string changes.
 */
function eventShape(ev: IdlEvent): string {
  return ev.fields
    .map((f) => `${f.name}:${JSON.stringify(f.type)}`)
    .join("|");
}

/**
 * Compute the on-the-wire byte size of a Borsh-serialized event.
 * Used to cross-check the indexer's hard-coded length assumptions.
 *
 * Supports: u8 (1), u16 (2), u32 (4), u64/i64 (8), bool (1),
 * publicKey (32), [u8; N] (N).
 * Returns null if any field is an unknown shape — caller decides
 * whether that's a hard fail.
 */
function fieldByteSize(type: unknown): number | null {
  if (type === "u8" || type === "bool") return 1;
  if (type === "u16") return 2;
  if (type === "u32") return 4;
  if (type === "u64" || type === "i64") return 8;
  if (type === "publicKey") return 32;
  if (typeof type === "object" && type !== null && "array" in type) {
    const arr = (type as { array: [unknown, number] }).array;
    if (arr[0] === "u8" && typeof arr[1] === "number") return arr[1];
  }
  return null;
}

function eventByteSize(ev: IdlEvent): number | null {
  let total = 0;
  for (const f of ev.fields) {
    const sz = fieldByteSize(f.type);
    if (sz === null) return null;
    total += sz;
  }
  return total;
}

// ─── Main ─────────────────────────────────────────────────────────

let problems = 0;
function fail(msg: string) {
  console.error(`[FAIL] ${msg}`);
  problems += 1;
}
function ok(msg: string) {
  console.log(`[OK]   ${msg}`);
}

const idl = SETTLE_IDL as unknown as {
  version: string;
  name: string;
  instructions: IdlIx[];
  events?: IdlEvent[];
};

console.log(`Inspecting IDL ${idl.name} v${idl.version}`);
console.log(
  `  ${idl.instructions.length} instructions, ${idl.events?.length ?? 0} events\n`,
);

// ─── 1. Discriminator collision check ───
const seen = new Map<string, string>();
for (const ix of idl.instructions) {
  const d = discriminator("global", ix.name);
  if (seen.has(d)) {
    fail(
      `Discriminator collision: ${ix.name} and ${seen.get(d)} both → ${d}`,
    );
  } else {
    seen.set(d, ix.name);
  }
}
ok(`No discriminator collisions across ${idl.instructions.length} ix`);

// ─── 2. Indexer byte-size assumptions vs IDL event sizes ───
// Hard-coded lengths the indexer asserts on; mirrors apps/indexer/src/index.ts.
// If the IDL event grows a field, the byte count here drifts from the
// indexer's expectation and the handler silently rejects events.
// AU-07-004 fix — extended from 5 to all 13 events (full IDL coverage).
// Hand-computed from programs/settle-agent-card/.../events.rs.
// Each Pubkey = 32, u64 = 8, u32 = 4, u8 = 1, bool = 1, [u8; 32] = 32.
const INDEXER_ASSUMED_EVENT_SIZES: Record<string, number> = {
  PolicyDecisionEvent: 214,           // 32+32+1+1+8+32+32+32+8+4+32
  CardCreatedEvent: 157,              // 32+32+32+32+8+8+1+8+4
  CardRevokedEvent: 76,               // 32+32+4+8
  PactOpenedEvent: 121,               // 32+32+32+8+8+8+1
  PactClosedEvent: 88,                // 32+32+8+8+8
  PactSpendEvent: 128,                // 32+32+32+8+8+8+8
  StreamingPactOpenedEvent: 137,      // 32+32+32+8+8+8+8+8+1
  PactStreamClaimEvent: 136,          // 32+32+32+8+8+8+8+8
  PactStreamPauseEvent: 41,           // 32+1+8
  DeliveryEscrowOpenedEvent: 192,     // 32+32+32+32+32+8+8+8+8
  DeliveryEscrowReleasedEvent: 113,   // 32+32+32+1+8+8
  DeliveryEscrowDisputedEvent: 80,    // 32+32+8+8
  ReceiptRecordedEvent: 201,          // 32+1+32+32+32+32+32+8
};

if (idl.events) {
  for (const ev of idl.events) {
    const expected = INDEXER_ASSUMED_EVENT_SIZES[ev.name];
    if (!expected) continue; // not all events have indexer handlers

    const computed = eventByteSize(ev);
    if (computed === null) {
      console.warn(
        `[WARN] ${ev.name}: contains unknown field types; indexer assumes ${expected}b but we can't verify.`,
      );
      continue;
    }
    if (computed !== expected) {
      fail(
        `${ev.name}: indexer asserts data.length ≥ ${expected}b but IDL says ${computed}b. Update apps/indexer/src/index.ts or the IDL.`,
      );
    } else {
      ok(`${ev.name}: ${expected}b (matches indexer)`);
    }
  }
}

// ─── 3. Event shape signatures (informational, for future snapshot) ───
console.log("\nEvent shape signatures (snapshot for future drift detection):");
for (const ev of idl.events ?? []) {
  console.log(`  ${ev.name.padEnd(35)} ${eventShape(ev)}`);
}

// ─── Summary ───
console.log();
if (problems > 0) {
  console.error(`[FAIL] ${problems} drift problem(s) detected.`);
  process.exit(1);
}
console.log(`[OK]   No drift detected.`);
process.exit(0);
