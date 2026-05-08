#!/usr/bin/env node
/**
 * Judge audit: probe negative paths through /api/x402/proxy. Each case must
 * REJECT with the right HTTP/deny code, not silently accept.
 */
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import bs58 from "bs58";

const BASE = "https://use-settle.vercel.app";
const PATH = "/api/x402/proxy/arxiv-fetch";
const FAKE_CRED = "settle://eyJ2IjoxLCJjYXJkIjoiOU53RXI2cWd0eUZCcjl5MUJ3MmdpbUFLQWlDeURXWnB1Q05NeFR0VjZWM1UiLCJhZ2VudF9wdWJrZXkiOiJDOUhBc3N2RkJ0RWdIdlpSVkdkZnhjVXdyR2Z1NWlLNFozRktuNTJOczdZWSIsImV4cGlyZXNfYXQiOiI5OTk5OTk5OTk5IiwiY2FwYWJpbGl0aWVzIjpbXSwiYXV0aG9yaXR5X3NpZyI6IjFhYWFhIn0";
const VALID_HASH = "c45734b2b7ccbde7914419c2589e7cedee90e9cd58d792b91b5bd8c8162f7e87";

function fakeAgentSig() {
  const kp = new Uint8Array(32);
  crypto.getRandomValues(kp);
  return bs58.encode(ed25519.sign(new Uint8Array(64), kp));
}
function nonce16() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex");
}

const cases = [
  {
    label: "no headers (challenge)",
    body: "{}",
    headers: { "Content-Type": "application/json" },
    expectStatus: 402,
    expectField: "x402Version",
  },
  {
    label: "credential present, missing X-Settle-Sig",
    body: "{}",
    headers: {
      "Content-Type": "application/json",
      "X-Settle-Credential": FAKE_CRED,
    },
    expectStatus: 400,
    expectField: "missing_x_settle_headers",
  },
  {
    label: "all required headers but invalid credential decode",
    body: "{}",
    headers: {
      "Content-Type": "application/json",
      "X-Settle-Credential": "settle://!!!not-base64-url!!!",
      "X-Settle-Sig": fakeAgentSig(),
      "X-Settle-Ts": String(Math.floor(Date.now() / 1000)),
      "X-Settle-Nonce": nonce16(),
      "X-Settle-Capability-Hash": VALID_HASH,
      "X-Settle-Amount-Lamports": "100000",
    },
    expectStatus: 401,
    expectField: "credential_decode_failed",
  },
  {
    label: "expired ts (skew > 300s)",
    body: "{}",
    headers: {
      "Content-Type": "application/json",
      "X-Settle-Credential": FAKE_CRED,
      "X-Settle-Sig": fakeAgentSig(),
      "X-Settle-Ts": "1000000000",
      "X-Settle-Nonce": nonce16(),
      "X-Settle-Capability-Hash": VALID_HASH,
      "X-Settle-Amount-Lamports": "100000",
    },
    expectStatus: 401,
    expectField: "ts_skew",
  },
  {
    label: "valid envelope structure but bad agent sig",
    body: "{}",
    headers: {
      "Content-Type": "application/json",
      "X-Settle-Credential": FAKE_CRED,
      "X-Settle-Sig": fakeAgentSig(),
      "X-Settle-Ts": String(Math.floor(Date.now() / 1000)),
      "X-Settle-Nonce": nonce16(),
      "X-Settle-Capability-Hash": VALID_HASH,
      "X-Settle-Amount-Lamports": "100000",
    },
    expectStatus: 401,
    expectField: "agent_sig_invalid",
  },
];

console.log(`Judge probe — ${BASE}${PATH}`);
console.log("");

let pass = 0;
const results = [];
for (const c of cases) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}${PATH}`, {
    method: "POST",
    headers: c.headers,
    body: c.body,
  });
  const text = await r.text();
  const dur = Date.now() - t0;
  const fieldOk = text.includes(c.expectField);
  const statusOk = r.status === c.expectStatus;
  const ok = statusOk && fieldOk;
  if (ok) pass += 1;
  results.push({ label: c.label, status: r.status, expectStatus: c.expectStatus, fieldOk, ok, dur });
  const icon = ok ? "✓" : "✗";
  console.log(`${icon} [${r.status} expected ${c.expectStatus}] [${c.expectField} ${fieldOk ? "found" : "MISSING"}] ${c.label} (${dur}ms)`);
  if (!ok) {
    console.log(`    body: ${text.slice(0, 200)}`);
  }
}

console.log(`\n=== ${pass}/${cases.length} negative-path probes pass ===`);
process.exit(pass === cases.length ? 0 : 1);
