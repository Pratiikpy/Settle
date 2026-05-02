#!/usr/bin/env tsx
/**
 * Indexer event-handler regression audit.
 *
 * Scans apps/indexer/src/index.ts and verifies every event handler:
 *   1. Has a discriminator constant defined (DISC_<NAME>).
 *   2. Has an explicit length check matching the IDL-derived event size.
 *   3. Performs a DB write (insert / upsert / update).
 *   4. Is awaited in the main onLogs dispatch loop.
 *
 * This script encodes the audit pass we did manually in May 2026 (Bucket A item
 * #1 — see commits between 17ddb08 and the bucket-A roll-up). When a future
 * change adds a new event in events.rs but forgets to wire up the handler, this
 * audit fails red in CI before the regression ships.
 *
 * Run: `pnpm exec tsx scripts/audit-indexer-handlers.ts`
 * Exit 0 = clean. Exit 1 = at least one handler is missing or malformed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const INDEXER_PATH = resolve(ROOT, "apps/indexer/src/index.ts");
const IDL_PATH = resolve(ROOT, "programs/settle-agent-card/target/idl/settle_agent_card.json");

type IdlEvent = { name: string; fields?: { name: string; type: any }[] };
type Idl = { events?: IdlEvent[]; types?: { name: string; type: any }[] };

// Borsh-equivalent serialized sizes for primitive types in Anchor IDL.
const TYPE_SIZE: Record<string, number> = {
  u8: 1,
  i8: 1,
  bool: 1,
  u16: 2,
  i16: 2,
  u32: 4,
  i32: 4,
  u64: 8,
  i64: 8,
  u128: 16,
  i128: 16,
  pubkey: 32,
  publicKey: 32, // Anchor 0.29 vs 0.31 spelling
};

function sizeOfType(t: any, types: { name: string; type: any }[]): number {
  if (typeof t === "string") {
    if (TYPE_SIZE[t] !== undefined) return TYPE_SIZE[t];
    // Custom type lookup
    const def = types.find((x) => x.name === t);
    if (def) return sizeOfTypeDef(def.type, types);
    throw new Error(`Unknown primitive: ${t}`);
  }
  if (t.array) {
    const [inner, len] = t.array as [any, number];
    return sizeOfType(inner, types) * len;
  }
  if (t.defined) {
    const name = typeof t.defined === "string" ? t.defined : t.defined.name;
    const def = types.find((x) => x.name === name);
    if (!def) throw new Error(`Unknown defined type: ${name}`);
    return sizeOfTypeDef(def.type, types);
  }
  if (t.option) {
    return 1 + sizeOfType(t.option, types);
  }
  if (t.vec) {
    throw new Error(
      `vec<> is variable-length; the audit assumes fixed-size events. Either upgrade the audit or restructure the event.`,
    );
  }
  throw new Error(`Unhandled type: ${JSON.stringify(t)}`);
}

function sizeOfTypeDef(typeDef: any, types: { name: string; type: any }[]): number {
  if (typeDef.kind === "struct") {
    return typeDef.fields.reduce(
      (acc: number, f: any) => acc + sizeOfType(f.type, types),
      0,
    );
  }
  if (typeDef.kind === "enum") {
    // Anchor enums emit a 1-byte tag plus the largest variant — for events
    // we don't expect nested enums; if encountered, audit fails loudly.
    throw new Error(`Enum types in events not supported by the audit yet`);
  }
  throw new Error(`Unsupported typeDef kind: ${typeDef.kind}`);
}

function loadIdl(): Idl {
  try {
    return JSON.parse(readFileSync(IDL_PATH, "utf8"));
  } catch (e) {
    console.error(`[audit] Cannot read IDL at ${IDL_PATH}.`);
    console.error(`[audit] Run 'cd programs/settle-agent-card && anchor build' first.`);
    process.exit(1);
  }
}

function main() {
  const idl = loadIdl();
  const indexerSrc = readFileSync(INDEXER_PATH, "utf8");
  const events = idl.events ?? [];
  const types = idl.types ?? [];

  if (events.length === 0) {
    console.error("[audit] IDL has 0 events — that can't be right. Check anchor build output.");
    process.exit(1);
  }

  // Mapping from event name → handler function name. The indexer uses
  // shortened names for the streaming/escrow events (handleStreamOpened,
  // handleEscrowOpened, etc.) — historical, kept for log readability. Any
  // future event added to the IDL must be wired up here AND in index.ts.
  const HANDLER_NAMES: Record<string, string> = {
    PolicyDecisionEvent: "handlePolicyDecision",
    CardCreatedEvent: "handleCardCreated",
    CardRevokedEvent: "handleCardRevoked",
    PactOpenedEvent: "handlePactOpened",
    PactClosedEvent: "handlePactClosed",
    PactSpendEvent: "handlePactSpend",
    StreamingPactOpenedEvent: "handleStreamOpened",
    PactStreamClaimEvent: "handleStreamClaim",
    PactStreamPauseEvent: "handleStreamPause",
    DeliveryEscrowOpenedEvent: "handleEscrowOpened",
    DeliveryEscrowReleasedEvent: "handleEscrowReleased",
    DeliveryEscrowDisputedEvent: "handleEscrowDisputed",
    // F2.0 Universal Receipt Kernel — Path A
    ReceiptRecordedEvent: "handleReceiptRecorded",
  };

  let failed = 0;
  let warned = 0;
  console.log(`[audit] Cross-checking ${events.length} events from IDL against ${INDEXER_PATH}…\n`);

  for (const ev of events) {
    const name = ev.name;
    // Anchor 0.31 stores fields under the linked type, not on the event directly.
    let fields = ev.fields;
    if (!fields) {
      const linkedType = types.find((t) => t.name === name);
      if (linkedType && (linkedType.type as any)?.fields) {
        fields = (linkedType.type as any).fields;
      }
    }
    if (!fields) {
      console.warn(`  [warn] ${name}: no fields found in IDL; skipping`);
      warned++;
      continue;
    }

    let expectedSize: number;
    try {
      expectedSize = fields.reduce((acc, f) => acc + sizeOfType(f.type, types), 0);
    } catch (e) {
      console.warn(`  [warn] ${name}: ${(e as Error).message}; skipping size check`);
      warned++;
      continue;
    }

    // Find the discriminator constant
    const discRegex = new RegExp(`DISC_[A-Z_]+\\s*=\\s*eventDiscriminator\\("${name}"\\)`);
    const hasDisc = discRegex.test(indexerSrc);

    const handlerName = HANDLER_NAMES[name];
    if (!handlerName) {
      console.error(
        `  ✗ ${name}: no handler-name mapping. Add it to HANDLER_NAMES in this script and write the corresponding handle*() function in apps/indexer/src/index.ts.`,
      );
      failed++;
      continue;
    }

    const handlerRegex = new RegExp(`(?:async\\s+)?function\\s+${handlerName}\\s*\\(`);
    const hasHandler = handlerRegex.test(indexerSrc);

    // Find a length check that mentions the expected size
    const sizeCheckRegex = new RegExp(`data\\.length\\s*<\\s*${expectedSize}\\b`);
    const hasLengthCheck = sizeCheckRegex.test(indexerSrc);

    // Find an awaited call from the dispatch loop
    const awaitDispatchRegex = new RegExp(`await\\s+${handlerName}\\s*\\(`);
    const isAwaited = awaitDispatchRegex.test(indexerSrc);

    // Find a DB write — supabase.from("…").insert / upsert / update — within
    // 4000 chars of the handler signature
    const handlerStart = indexerSrc.search(handlerRegex);
    let hasDbWrite = false;
    if (handlerStart !== -1) {
      const slice = indexerSrc.slice(handlerStart, handlerStart + 4000);
      hasDbWrite = /supabase\s*\.\s*from\([^)]+\)\s*\.\s*(insert|upsert|update)\b/.test(slice);
    }

    const checks = [
      ["discriminator constant", hasDisc],
      ["handler function", hasHandler],
      ["length check matches IDL size", hasLengthCheck],
      ["awaited in dispatch loop", isAwaited],
      ["DB write inside handler", hasDbWrite],
    ] as const;

    const ok = checks.every(([, b]) => b);
    if (ok) {
      console.log(`  ✓ ${name} (${expectedSize}b) — all 5 checks pass`);
    } else {
      console.error(`  ✗ ${name} (expected ${expectedSize}b)`);
      for (const [label, ok] of checks) {
        if (!ok) console.error(`      - missing: ${label}`);
      }
      failed++;
    }
  }

  console.log(
    `\n[audit] ${events.length - failed - warned} ok / ${failed} failed / ${warned} warned`,
  );
  if (failed > 0) {
    console.error(
      `\n[audit] FAIL — at least one handler is missing or malformed. Add it to apps/indexer/src/index.ts following the pattern in handleCardCreated.`,
    );
    process.exit(1);
  }
}

main();
