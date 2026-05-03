#!/usr/bin/env tsx
/**
 * Section 24.6 — verifies all 13 webhook event types can be HMAC-signed
 * + delivered to the local receiver.
 */
import "dotenv/config";
import { createHmac } from "crypto";

const RECEIVER = "http://localhost:4000/webhook";
const SECRET = process.env.WEBHOOK_SECRET ?? "test-secret";

const EVENTS = [
  "card.created",
  "card.revoked",
  "pact.opened",
  "pact.closed",
  "pact.spent",
  "stream.opened",
  "stream.claimed",
  "stream.paused",
  "escrow.opened",
  "escrow.released",
  "escrow.disputed",
  "receipt.created",
  "receipt.refunded",
];

function sign(body: string, ts: string): string {
  return createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
}

async function main() {
  console.log("# webhook-events-coverage");
  // Reset receiver
  try {
    await fetch("http://localhost:4000/reset", { method: "POST", signal: AbortSignal.timeout(2000) });
  } catch {
    console.log("✗ webhook receiver not running on :4000");
    console.log("  start with: WEBHOOK_SECRET=test-secret pnpm tsx scripts/webhook-receiver.ts &");
    process.exit(1);
  }

  let ok = 0;
  for (const evt of EVENTS) {
    const body = JSON.stringify({ event: evt, data: { test: true, ts: Date.now() } });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = sign(body, ts);
    const r = await fetch(RECEIVER, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Settle-Signature": `t=${ts},v1=${sig}`,
        "Settle-Event": evt,
        "Settle-Idempotency-Key": `cov-${evt}-${ts}`,
      },
      body,
    });
    const j = (await r.json()) as { signatureValid: boolean };
    if (r.status === 200 && j.signatureValid) {
      console.log(`✓ ${evt}`);
      ok++;
    } else {
      console.log(`✗ ${evt} → ${r.status} signatureValid=${j.signatureValid}`);
    }
  }
  // Verify receiver buffered all events
  const events = await fetch("http://localhost:4000/events", { signal: AbortSignal.timeout(5000) });
  const list = (await events.json()) as { count: number };
  console.log(`\nBuffer: ${list.count} events`);
  console.log(`✓ ${ok}/${EVENTS.length} events delivered with valid HMAC`);
  if (ok !== EVENTS.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
