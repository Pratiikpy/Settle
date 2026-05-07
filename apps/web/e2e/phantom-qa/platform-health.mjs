#!/usr/bin/env node
/**
 * Platform health driver — exercises three operational surfaces:
 *   /api/preflight         — 7-check supabase / migration / relayer / RPC / cron / webhook
 *   /api/auth/challenge    — formal auth-challenge issuance (vs. local nonce)
 *   /api/federation/list   — cross-instance receipt sharing
 *   /api/federation/origins — list of trusted federation origins
 *
 * Surfaces operational warnings (yellow/red preflight checks) so a
 * judge or operator can spot config drift at a glance.
 */

import { Keypair } from "@solana/web3.js";

const PRODUCTION = "https://use-settle.vercel.app";
const MY_WALLET = "B4cArR1M1MySM4dn4HeDdifdPiF98wTNmbzKYg6to2Cp";

let pass = 0, fail = 0, warn = 0;
const log = (statusOrBool, name, detail) => {
  // Accept boolean (treats true→pass, false→fail) or explicit status string
  let status;
  if (typeof statusOrBool === "boolean") {
    status = statusOrBool ? "pass" : "fail";
  } else {
    status = statusOrBool;
  }
  const tag = { pass: "PASS", fail: "FAIL", warn: "WARN" }[status] ?? "INFO";
  console.log(`[${tag}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (status === "pass") pass++;
  else if (status === "fail") fail++;
  else if (status === "warn") warn++;
};

// 1. Preflight — verify all checks present + flag any non-green
const r1 = await fetch(`${PRODUCTION}/api/preflight`, {
  cache: "no-store",
  signal: AbortSignal.timeout(15_000),
});
const preflight = await r1.json();
log(r1.ok && preflight.ok, "1. /api/preflight returns ok", `${preflight.counts?.green}/${preflight.checks?.length} green`);

console.log(`     ${preflight.checks?.length} operational checks:`);
for (const c of preflight.checks ?? []) {
  const icon = c.status === "green" ? "✓" : c.status === "yellow" ? "⚠" : "✗";
  console.log(`       ${icon} ${c.name}: ${c.hint?.slice(0, 75) ?? ""}`);
  if (c.status === "yellow") {
    log("warn", `   yellow: ${c.name}`, c.hint?.slice(0, 60));
  } else if (c.status === "red") {
    log("fail", `   red: ${c.name}`, c.hint?.slice(0, 60));
  }
}

// 2. Auth challenge endpoint
const r2 = await fetch(`${PRODUCTION}/api/auth/challenge?pubkey=${MY_WALLET}`, {
  signal: AbortSignal.timeout(10_000),
});
const ch = await r2.json();
log(
  r2.ok && /^[a-f0-9]{32}$/.test(ch.nonce ?? "") && typeof ch.message === "string",
  "2. /api/auth/challenge issues fresh nonce + canonical message",
  `nonce=${ch.nonce?.slice(0, 8)}… ts=${ch.ts}`,
);

// 3. Federation origins list
const r3 = await fetch(`${PRODUCTION}/api/federation/origins`, {
  signal: AbortSignal.timeout(10_000),
});
const origins = await r3.json();
log(
  r3.ok && Array.isArray(origins.origins) && origins.origins.length > 0,
  "3. /api/federation/origins lists trusted instances",
  `${origins.origins?.length ?? 0} trusted origin(s)`,
);
for (const o of origins.origins ?? []) {
  console.log(`     • ${o.label ?? o.origin_id} — ${o.receipt_count ?? 0} receipt(s) since ${o.trusted_since?.slice(0, 10)}`);
}

// 4. Federation list — receipts visible to my wallet
const r4 = await fetch(`${PRODUCTION}/api/federation/list?pubkey=${MY_WALLET}`, {
  signal: AbortSignal.timeout(10_000),
});
const fed = await r4.json();
log(
  r4.ok && Array.isArray(fed.receipts),
  "4. /api/federation/list returns cross-instance receipts for my pubkey",
  `${fed.receipts?.length ?? 0} federated receipt(s)`,
);
for (const f of (fed.receipts ?? []).slice(0, 3)) {
  console.log(`     • ${f.amount_lamports} ${f.asset} ${f.sender_pubkey.slice(0, 6)}…→${f.recipient_pubkey.slice(0, 6)}… status=${f.status}`);
}

console.log(`\n${pass}/${pass + fail + warn} pass, ${warn} warn, ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
