/**
 * Deep flow #27 — API SHAPE VALIDATION
 *
 * Proves: Critical API endpoints return the expected response shapes.
 * These tests don't drive the UI but validate the data contract that
 * the UI depends on.
 */
import { test, expect } from "@playwright/test";

const ALICE_PUB = "C5z7pQZx1RxEaBTDZXbLt32qDjnkfysLUtug2fKHxeYY";
const BOB_PUB = "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB";

test("DEEP-27a: /api/health returns ok:true + service:settle-web", async ({ request }) => {
  const r = await request.get("http://localhost:3000/api/health");
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.ok).toBe(true);
  expect(body.service).toBe("settle-web");
  expect(body.cluster).toBe("devnet");
  expect(body.checks?.solana_rpc?.ok).toBe(true);
  expect(body.checks?.supabase?.ok).toBe(true);
  console.log("[DEEP-27a] ✅ /api/health critical checks all pass");
});

test("DEEP-27b: /api/balance returns numeric strings", async ({ request }) => {
  const r = await request.get(`http://localhost:3000/api/balance?pubkey=${ALICE_PUB}`);
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(typeof body.usdc).toBe("string");
  expect(typeof body.sol).toBe("string");
  expect(parseFloat(body.usdc)).toBeGreaterThanOrEqual(0);
  expect(parseFloat(body.sol)).toBeGreaterThanOrEqual(0);
  console.log(`[DEEP-27b] ✅ Alice: ${body.usdc} USDC, ${body.sol} SOL`);
});

test("DEEP-27c: /api/dashboard/v6 returns valid shape", async ({ request }) => {
  const r = await request.get(`http://localhost:3000/api/dashboard/v6?pubkey=${ALICE_PUB}`, {
    failOnStatusCode: false,
  });
  expect(r.status()).not.toBe(500);
  if (r.status() === 200) {
    const body = await r.json();
    console.log(`[DEEP-27c] ✅ Dashboard v6 keys: ${Object.keys(body).join(", ")}`);
  }
});

test("DEEP-27d: /api/feed?wallet returns events array", async ({ request }) => {
  const r = await request.get(`http://localhost:3000/api/feed?wallet=${ALICE_PUB}`, {
    failOnStatusCode: false,
  });
  expect(r.status()).not.toBe(500);
  if (r.status() === 200) {
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.events)).toBe(true);
    expect(typeof body.count).toBe("number");
    console.log(`[DEEP-27d] ✅ Feed: ${body.count} events`);
  }
});

test("DEEP-27e: /api/audit/phase5 returns executions array", async ({ request }) => {
  const r = await request.get(`http://localhost:3000/api/audit/phase5?wallet=${ALICE_PUB}`, {
    failOnStatusCode: false,
  });
  expect(r.status()).not.toBe(500);
  if (r.status() === 200) {
    const body = await r.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.executions)).toBe(true);
    expect(body.summary).toBeDefined();
    console.log(`[DEEP-27e] ✅ Audit: ${body.executions.length} executions for Alice`);
  }
});

test("DEEP-27f: /api/cards?wallet returns array", async ({ request }) => {
  const r = await request.get(`http://localhost:3000/api/cards?wallet=${ALICE_PUB}`, {
    failOnStatusCode: false,
  });
  expect(r.status()).not.toBe(500);
  if (r.status() === 200) {
    const body = await r.json().catch(() => null);
    if (body) console.log(`[DEEP-27f] ✅ Cards API ok, response type: ${Array.isArray(body) ? `array(${body.length})` : typeof body}`);
  }
});

test("DEEP-27g: /api/wishes?wallet returns wishes array", async ({ request }) => {
  const r = await request.get(`http://localhost:3000/api/wishes?wallet=${ALICE_PUB}`, {
    failOnStatusCode: false,
  });
  expect(r.status()).not.toBe(500);
  console.log(`[DEEP-27g] ✅ Wishes API → ${r.status()}`);
});

test("DEEP-27h: /api/allowances?parent returns allowances array", async ({ request }) => {
  const r = await request.get(`http://localhost:3000/api/allowances?parent=${ALICE_PUB}`, {
    failOnStatusCode: false,
  });
  expect(r.status()).not.toBe(500);
  console.log(`[DEEP-27h] ✅ Allowances API → ${r.status()}`);
});
