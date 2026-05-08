#!/usr/bin/env node
/**
 * End-to-end ALLOW round-trip proof for /api/x402/proxy/arxiv-fetch.
 *
 * What this proves:
 *   - The proxy accepts a valid Settle credential
 *   - The 4-hash kernel commit gets signed and on-chain spend_via_pact lands
 *   - The merchant deliverable comes back via the proxy
 *   - All the pieces (capability registry, verified_merchants, Upstash,
 *     facilitator key, merchant pubkeys, inline deliverable) compose correctly
 *
 * Custody:
 *   - AUTHORITY = local deployer keypair (~/.config/solana/id.json)
 *   - AGENT     = production facilitator (we fetch its pubkey + ask it to
 *                  sign per-request canonical bytes via
 *                  /api/admin/facilitator-sign)
 *
 * The deployer signs `create_card` + `open_pact` locally. The facilitator,
 * server-side, signs the per-request canonical bytes the proxy verifies, then
 * the proxy submits `spend_via_pact` itself.
 *
 * Cost: tiny. Pact funded with 0.20 USDC; one $0.10 arxiv-fetch call.
 *       Deployer pays SOL fees for create_card + open_pact (≈ 0.005 SOL).
 *       Facilitator pays SOL fees for spend_via_pact (≈ 0.005 SOL).
 *
 * Usage:   node scripts/test-roundtrip-proxy.mjs
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import bs58 from "bs58";
import {
  createCardIx,
  openPactIx,
  labelHashBytes,
  findAgentCardPda,
  findPactPda,
  findPactVaultPda,
} from "../../lib/anchor-client";

const BASE = process.env.BASE_URL ?? "https://use-settle.vercel.app";
const RPC = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const ARXIV_MERCHANT = new PublicKey(
  "5xyG5PpFZYwVsR5mzec1Yg4HbyqqacUSPvW9oGeUDFnm",
);
const ARXIV_CAPABILITY_HASH =
  "c45734b2b7ccbde7914419c2589e7cedee90e9cd58d792b91b5bd8c8162f7e87";

const ID_JSON = resolve(homedir(), ".config", "solana", "id.json");
const deployerSecret = new Uint8Array(JSON.parse(readFileSync(ID_JSON, "utf8")));
const deployer = Keypair.fromSecretKey(deployerSecret);
console.log(`Deployer (authority): ${deployer.publicKey.toBase58()}`);

function signAuthHeaders() {
  const tsUnix = Math.floor(Date.now() / 1000);
  const nonce = bs58.encode(crypto.getRandomValues(new Uint8Array(16)));
  const msg = `Settle Auth\nnonce=${nonce}\nts=${tsUnix}\npubkey=${deployer.publicKey.toBase58()}`;
  const sigBytes = ed25519.sign(
    new TextEncoder().encode(msg),
    deployerSecret.slice(0, 32),
  );
  return {
    "x-settle-auth-pubkey": deployer.publicKey.toBase58(),
    "x-settle-auth-sig": bs58.encode(sigBytes),
    "x-settle-auth-nonce": nonce,
    "x-settle-auth-ts": String(tsUnix),
  };
}

// 1. Get facilitator pubkey.
console.log("\n=== STEP 1: fetch facilitator pubkey ===");
const facRes = await fetch(`${BASE}/api/admin/facilitator-sign`, {
  headers: signAuthHeaders(),
});
const facJson = await facRes.json();
if (!facRes.ok || !facJson.facilitator_pubkey) {
  console.error(`Failed: ${facRes.status} ${JSON.stringify(facJson)}`);
  process.exit(1);
}
const facilitatorPubkey = new PublicKey(facJson.facilitator_pubkey);
console.log(`Facilitator (agent):   ${facilitatorPubkey.toBase58()}`);

const conn = new Connection(RPC, { commitment: "confirmed" });
const stamp = Date.now().toString(36).slice(-6);
const cardLabel = `proxy-rt-${stamp}`;
const cardLabelHash = labelHashBytes(cardLabel);
const [cardPda] = findAgentCardPda(deployer.publicKey, cardLabelHash);
const scopeHash = labelHashBytes(`pact-${stamp}`);
const [pactPda] = findPactPda(cardPda, scopeHash);
const [vaultPda] = findPactVaultPda(pactPda);
console.log(`Card PDA:              ${cardPda.toBase58()}`);
console.log(`Pact PDA:              ${pactPda.toBase58()}`);
console.log(`Vault PDA:             ${vaultPda.toBase58()}`);

const slot = await conn.getSlot("confirmed");
const expirySlot = BigInt(slot + 100_000);

async function send(tx, label) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.lastValidBlockHeight = lastValidBlockHeight;
  tx.feePayer = deployer.publicKey;
  tx.sign(deployer);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed",
  );
  console.log(`  ${label}: ${sig}`);
  console.log(`  https://solscan.io/tx/${sig}?cluster=devnet`);
  return sig;
}

// 2. create_card with allowlist=[arxiv merchant], agent_pubkey=facilitator
console.log("\n=== STEP 2: create_card (authority=deployer, agent=facilitator) ===");
const createIx = createCardIx({
  authority: deployer.publicKey,
  card: cardPda,
  usdcMint: USDC_MINT,
  args: {
    agentPubkey: facilitatorPubkey,
    labelHash: cardLabelHash,
    dailyCapLamports: 500_000n, // 0.50 USDC daily
    perCallMaxLamports: 200_000n, // 0.20 USDC per call
    allowlist: [
      {
        merchant: ARXIV_MERCHANT,
        capabilityHash: Buffer.from(ARXIV_CAPABILITY_HASH, "hex"),
      },
    ],
    expirySlot,
    policyVersion: 1,
  },
});
await send(new Transaction().add(createIx), "create_card");

// 3. open_pact — funds the vault from deployer's USDC ATA
console.log("\n=== STEP 3: open_pact (funds 0.20 USDC vault) ===");
const openIx = openPactIx({
  authority: deployer.publicKey,
  parentCard: cardPda,
  pact: pactPda,
  usdcMint: USDC_MINT,
  args: {
    scopeLabelHash: scopeHash,
    capLamports: 200_000n, // 0.20 USDC vault
    allowlist: [
      {
        merchant: ARXIV_MERCHANT,
        capabilityHash: Buffer.from(ARXIV_CAPABILITY_HASH, "hex"),
      },
    ],
    expirySlot,
  },
});
await send(new Transaction().add(openIx), "open_pact");

const vaultUsdc = await getAssociatedTokenAddress(USDC_MINT, vaultPda, true);
const vaultAcc = await getAccount(conn, vaultUsdc);
console.log(`  vault balance: ${(Number(vaultAcc.amount) / 1e6).toFixed(6)} USDC`);

// 4. Build credential envelope
console.log("\n=== STEP 4: build credential envelope (deployer-signed) ===");
const expiresAtUnix = Math.floor(Date.now() / 1000) + 3600;
const envelopeBase = {
  v: 1,
  card: cardPda.toBase58(),
  agent_pubkey: facilitatorPubkey.toBase58(),
  expires_at: String(expiresAtUnix),
  capabilities: [ARXIV_CAPABILITY_HASH],
};
function canonicalEnvelopeBytes(env) {
  const sorted = Object.fromEntries(
    Object.entries(env).sort(([a], [b]) => a.localeCompare(b)),
  );
  return new TextEncoder().encode(JSON.stringify(sorted));
}
const envBytes = canonicalEnvelopeBytes(envelopeBase);
const authoritySig = ed25519.sign(envBytes, deployerSecret.slice(0, 32));
const envelope = { ...envelopeBase, authority_sig: bs58.encode(authoritySig) };
const credential =
  "settle://" +
  Buffer.from(JSON.stringify(envelope)).toString("base64url");
console.log(`  envelope:    v=1 card=…${cardPda.toBase58().slice(-6)} caps=[${ARXIV_CAPABILITY_HASH.slice(0, 8)}…]`);
console.log(`  credential:  ${credential.slice(0, 64)}…`);

// 5. Compute canonical request bytes for the proxy call
console.log("\n=== STEP 5: ask facilitator to sign canonical request bytes ===");
const reqBody = JSON.stringify({ paper_id: "2305.12345", lang_hint: "ja" });
const reqBodyBytes = new TextEncoder().encode(reqBody);
const tsUnix = Math.floor(Date.now() / 1000);
const nonce = bs58
  .encode(crypto.getRandomValues(new Uint8Array(16)))
  .slice(0, 32);
const requestId = randomUUID();
const purpose =
  "End-to-end round-trip proof: deployer-funded card spending through proxy.";
const reqPath = "/api/x402/proxy/arxiv-fetch";
const bodyHashHex = Buffer.from(sha256(reqBodyBytes)).toString("hex");
const canonical = `POST\n${reqPath}\n${bodyHashHex}\n${tsUnix}\n${nonce}`;
const canonicalB64 = Buffer.from(canonical, "utf8").toString("base64");

const sigRes = await fetch(`${BASE}/api/admin/facilitator-sign`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...signAuthHeaders() },
  body: JSON.stringify({ canonical_b64: canonicalB64 }),
});
const sigJson = await sigRes.json();
if (!sigRes.ok || !sigJson.sig_b58) {
  console.error(`Sign failed: ${sigRes.status} ${JSON.stringify(sigJson)}`);
  process.exit(1);
}
console.log(`  agent_sig:   ${sigJson.sig_b58.slice(0, 24)}…`);

// 6. POST to /api/x402/proxy/arxiv-fetch
console.log("\n=== STEP 6: POST /api/x402/proxy/arxiv-fetch ===");
const startedAt = Date.now();
const proxyRes = await fetch(`${BASE}${reqPath}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Settle-Credential": credential,
    "X-Settle-Sig": sigJson.sig_b58,
    "X-Settle-Ts": String(tsUnix),
    "X-Settle-Nonce": nonce,
    "X-Settle-Request-Id": requestId,
    "X-Settle-Capability-Hash": ARXIV_CAPABILITY_HASH,
    "X-Settle-Amount-Lamports": "100000",
    "X-Settle-Purpose": purpose,
    "X-Settle-Pact-Pubkey": pactPda.toBase58(),
  },
  body: reqBody,
});
const elapsed = Date.now() - startedAt;
const proxyText = await proxyRes.text();
console.log(`  status:      ${proxyRes.status} (${elapsed}ms)`);
console.log(`  body:        ${proxyText.slice(0, 400)}…`);

if (proxyRes.status !== 200) {
  console.error(`\nFAIL — expected 200 ALLOW, got ${proxyRes.status}`);
  process.exit(1);
}

const proxyJson = JSON.parse(proxyText);
console.log(`\n=== ROUND-TRIP PASS ===`);
console.log(`  decision:        ${proxyJson.decision}`);
console.log(`  spend_signature: ${proxyJson.spend_signature}`);
console.log(`  Solscan:         https://solscan.io/tx/${proxyJson.spend_signature}?cluster=devnet`);
console.log(`  receipt_hash:    ${proxyJson.receipt_hash}`);
console.log(`  request_id:      ${proxyJson.request_id}`);
console.log(`  deliverable:     ${JSON.stringify(proxyJson.deliverable?.deliverable ?? proxyJson.deliverable, null, 2).slice(0, 500)}`);

// 7. Verify the receipt is fetchable through /api/verify/<hash>
console.log(`\n=== STEP 7: verify receipt hash round-trip ===`);
const verifyRes = await fetch(`${BASE}/api/verify/${proxyJson.receipt_hash}`);
const verifyJson = await verifyRes.json();
console.log(`  /api/verify status: ${verifyRes.status}`);
console.log(`  found:              ${verifyJson.ok ? "YES" : "NO"}`);
if (verifyJson.spend_signature) {
  console.log(`  match spend_sig:    ${verifyJson.spend_signature === proxyJson.spend_signature ? "YES" : "NO"}`);
}
