#!/usr/bin/env node
/**
 * `create-settle-merchant` scaffold driver — proves the developer
 * onboarding CLI works end-to-end. This is the "npm create settle-merchant"
 * surface: a 1-second invocation that gives a new merchant their
 * keypair, capability hash, webhook secret, and .env template.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

let pass = 0, fail = 0;
const log = (ok, name, detail) => {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const tmp = mkdtempSync(join(tmpdir(), "settle-merchant-"));
const cliPath = process.platform === "win32"
  ? "C:\\Users\\prate\\Downloads\\solana\\settle-protocol\\packages\\create-settle-merchant\\dist\\cli.js"
  : "/mnt/c/Users/prate/Downloads/solana/settle-protocol/packages/create-settle-merchant/dist/cli.js";

// 1. Run the scaffold
const r = spawnSync(process.execPath, [cliPath, "test-merchant", "--no-prompt"], {
  cwd: tmp,
  encoding: "utf8",
});
log(r.status === 0, "1. Scaffold ran successfully", r.status === 0 ? "exit 0" : `exit ${r.status}: ${r.stderr}`);

const projectDir = join(tmp, "test-merchant");
log(existsSync(projectDir), "2. Project directory created");

// 2. Verify .env.template exists and has expected vars
const envText = existsSync(join(projectDir, ".env.template"))
  ? readFileSync(join(projectDir, ".env.template"), "utf8")
  : "";
const requiredVars = [
  "MERCHANT_PUBKEY=",
  "MERCHANT_PRIVKEY_B58=",
  "SETTLE_WEBHOOK_SIGNING_SECRET=",
  "SETTLE_DEMO_CAPABILITY_HASH=",
  "SETTLE_ENDPOINT=",
];
const missing = requiredVars.filter((v) => !envText.includes(v));
log(missing.length === 0, "3. .env.template contains all required vars", missing.length ? `missing: ${missing.join(",")}` : "");

// 3. Verify generated keypair file is valid Ed25519 + matches the pubkey in .env.template
const kpPath = join(projectDir, "merchant.keypair.json");
log(existsSync(kpPath), "4. merchant.keypair.json created");

const kpRaw = JSON.parse(readFileSync(kpPath, "utf8"));
const kp = Keypair.fromSecretKey(Uint8Array.from(kpRaw));
const generatedPubkey = kp.publicKey.toBase58();
const envPubkeyMatch = envText.match(/MERCHANT_PUBKEY=(\S+)/);
log(
  envPubkeyMatch && envPubkeyMatch[1] === generatedPubkey,
  "5. Pubkey in .env.template matches keypair.json",
  generatedPubkey,
);

// 4. Verify privkey b58 in .env decodes to the same keypair
const privkeyMatch = envText.match(/MERCHANT_PRIVKEY_B58=(\S+)/);
const decodedKp = Keypair.fromSecretKey(bs58.decode(privkeyMatch[1]));
log(
  decodedKp.publicKey.toBase58() === generatedPubkey,
  "6. PRIVKEY_B58 in .env round-trips to same pubkey",
);

// 5. Verify capability hash is 64-char hex (BLAKE3-style)
const capMatch = envText.match(/SETTLE_DEMO_CAPABILITY_HASH=(\S+)/);
log(
  /^[0-9a-f]{64}$/i.test(capMatch?.[1] ?? ""),
  "7. Capability hash is 64-char hex",
  capMatch?.[1].slice(0, 16) + "…",
);

// 6. Verify webhook secret is non-trivial (base64-ish, > 30 chars)
const secretMatch = envText.match(/SETTLE_WEBHOOK_SIGNING_SECRET=(\S+)/);
log(
  (secretMatch?.[1]?.length ?? 0) >= 30,
  "8. Webhook signing secret is non-trivial",
  `${secretMatch?.[1]?.length}-char`,
);

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
