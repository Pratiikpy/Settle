/**
 * Demo Agent ("Agent-1") — generic AI agent runner used in the 90-second demo.
 *
 * It does NOT hold a wallet for sending funds. It holds an Ed25519 keypair that signs
 * request payloads (the dual-sig pattern). The Settle facilitator validates the agent_sig
 * AND uses the same keypair to sign the on-chain `spend_via_pact` ix.
 *
 * Usage:
 *   1. Read SETTLE_CREDENTIAL from .env (the `settle://...` envelope).
 *   2. SETTLE_AGENT_PRIVKEY is the same key as the facilitator's. The facilitator co-signs
 *      the on-chain spend ix as `agent_pubkey` (vault PDA executes the SPL transfer).
 *   3. SETTLE_PACT_PUBKEY identifies which pact's vault funds the spend.
 *   4. For each task, compute the canonical capability hash via @settle/sdk's
 *      computeCapabilityHashHex — same algorithm the proxy uses, so headers match.
 *   5. Make the HTTP request with X-Settle-* headers. The proxy validates dual-sig,
 *      checks pact policy, signs spend_via_pact, submits, returns the deliverable.
 */

import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import bs58 from "bs58";
import { config } from "dotenv";
import { randomBytes, randomUUID } from "node:crypto";
import { computeCapabilityHashHex, type CapabilitySpec } from "@settle/sdk";

config();

const FACILITATOR_BASE = process.env.SETTLE_FACILITATOR_URL ?? "http://localhost:3000";
const CREDENTIAL = process.env.SETTLE_CREDENTIAL;
const AGENT_PRIVKEY_B58 = process.env.SETTLE_AGENT_PRIVKEY;
const PACT_PUBKEY = process.env.SETTLE_PACT_PUBKEY;

if (!CREDENTIAL) {
  console.error("SETTLE_CREDENTIAL env var required (settle://...).");
  process.exit(1);
}
if (!AGENT_PRIVKEY_B58) {
  console.error("SETTLE_AGENT_PRIVKEY env var required (base58-encoded 64-byte secret).");
  process.exit(1);
}
if (!PACT_PUBKEY) {
  console.warn(
    "[demo-agent] SETTLE_PACT_PUBKEY unset. Falling back to direct (authority-signed) spend mode. " +
      "For autonomous agent demo, set SETTLE_PACT_PUBKEY (run `pnpm tsx scripts/seed-demo-card.ts`).",
  );
}

const agentSecret = bs58.decode(AGENT_PRIVKEY_B58);

// Capability specs — must match apps/web/app/api/x402/proxy/[merchant]/route.ts.
// The proxy computes the same hash from these specs and compares to X-Settle-Capability-Hash.
const CAPS = {
  "arxiv-fetch": {
    domain: "arxiv-fetch.demo.settle",
    method: "POST",
    path: "/api/x402/proxy/arxiv-fetch",
    amount_lamports: "100000",
    version: 1,
  },
  translate: {
    domain: "translate.demo.settle",
    method: "POST",
    path: "/api/x402/proxy/translate",
    amount_lamports: "300000",
    version: 1,
  },
  summarize: {
    domain: "summarize.demo.settle",
    method: "POST",
    path: "/api/x402/proxy/summarize",
    amount_lamports: "50000",
    version: 1,
  },
} satisfies Record<string, CapabilitySpec>;

interface Task {
  merchant: "ArxivFetch" | "TranslateAPI" | "SummaryLLM";
  slug: keyof typeof CAPS;
  body: Record<string, unknown>;
}

const TASKS: Task[] = [
  {
    merchant: "ArxivFetch",
    slug: "arxiv-fetch",
    body: { paper_id: "2305.12345", lang_hint: "ja" },
  },
  {
    merchant: "TranslateAPI",
    slug: "translate",
    body: { source: "ja", target: "en" },
  },
  {
    merchant: "SummaryLLM",
    slug: "summarize",
    body: { audience: "eli12" },
  },
];

function canonicalRequest(
  method: string,
  path: string,
  bodyBytes: Uint8Array,
  ts: number,
  nonce: string,
): Uint8Array {
  const lines = [method, path, Buffer.from(sha256(bodyBytes)).toString("hex"), String(ts), nonce];
  return new TextEncoder().encode(lines.join("\n"));
}

async function runOne(task: Task) {
  const spec = CAPS[task.slug];
  const targetPath = spec.path;
  const targetMethod = spec.method;
  const url = `${FACILITATOR_BASE}${targetPath}`;
  const capabilityHash = computeCapabilityHashHex(spec);

  const tsUnix = Math.floor(Date.now() / 1000);
  const nonce = randomBytes(16).toString("hex");
  const requestId = randomUUID();
  const purposeString = `Pay ${task.merchant} for one task as part of demo flow.`;

  const bodyJson = JSON.stringify(task.body);
  const bodyBytes = new TextEncoder().encode(bodyJson);
  const canonical = canonicalRequest(targetMethod, targetPath, bodyBytes, tsUnix, nonce);

  const sig = ed25519.sign(canonical, agentSecret.slice(0, 32));
  const sigB58 = bs58.encode(sig);

  console.log(
    `\n→ ${task.merchant} ($${(parseInt(spec.amount_lamports, 10) / 1e6).toFixed(2)}) ...`,
  );
  const startedAt = Date.now();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Settle-Credential": CREDENTIAL!,
    "X-Settle-Sig": sigB58,
    "X-Settle-Ts": String(tsUnix),
    "X-Settle-Nonce": nonce,
    "X-Settle-Request-Id": requestId,
    "X-Settle-Capability-Hash": capabilityHash,
    "X-Settle-Amount-Lamports": spec.amount_lamports,
    "X-Settle-Purpose": purposeString,
  };

  if (PACT_PUBKEY) {
    headers["X-Settle-Pact-Pubkey"] = PACT_PUBKEY;
  }

  const res = await fetch(url, { method: targetMethod, headers, body: bodyJson });
  const elapsed = Date.now() - startedAt;

  if (!res.ok) {
    let denyData: { error?: string; deny_code?: number; reason?: string } = {};
    try {
      denyData = await res.json();
    } catch {
      // ignore
    }
    if (res.status === 402) {
      console.error(
        `  ✗ ${res.status} DENY (${elapsed}ms) deny_code=${denyData.deny_code} reason="${denyData.reason ?? denyData.error}"`,
      );
    } else {
      console.error(`  ✗ ${res.status} ${res.statusText} (${elapsed}ms): ${denyData.error ?? "?"}`);
    }
    return null;
  }

  const data = await res.json();
  console.log(`  ✓ ${res.status} ALLOW in ${elapsed}ms`);
  console.log(`  receipt:  ${data.receipt_hash?.slice(0, 16)}…`);
  console.log(`  spend tx: ${data.spend_signature?.slice(0, 16)}…`);
  return data;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("Settle Demo Agent · Agent-1");
  console.log(`Facilitator: ${FACILITATOR_BASE}`);
  console.log(`Pact:        ${PACT_PUBKEY ?? "(direct mode — no pact)"}`);
  console.log(`Tasks:       ${TASKS.length}`);
  console.log("═══════════════════════════════════════════════════════════════");

  const results: unknown[] = [];
  for (const task of TASKS) {
    const result = await runOne(task);
    if (result) results.push(result);
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`Done. ${results.length}/${TASKS.length} tasks completed.`);
  if (results.length > 0) {
    const total = TASKS.slice(0, results.length).reduce(
      (sum, t) => sum + parseInt(CAPS[t.slug].amount_lamports, 10),
      0,
    );
    console.log(`Total spent: $${(total / 1e6).toFixed(2)}`);
  }
}

void main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
