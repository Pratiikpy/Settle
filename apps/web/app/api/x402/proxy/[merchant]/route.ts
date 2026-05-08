import { NextRequest, NextResponse } from "next/server";
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  clusterApiUrl,
} from "@solana/web3.js";
import { ed25519 } from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { blake3 } from "@noble/hashes/blake3";
import bs58 from "bs58";
import { randomUUID } from "node:crypto";
import {
  bytesToHex,
  buildReceiptHashes,
  DenyCode,
  type CanonicalPolicySnapshot,
  type CanonicalReason,
  type CanonicalReceipt,
  type DenyCodeValue,
} from "@settle/sdk";
import {
  spendIxWithAtas,
  spendViaPactIxWithAtas,
  recordDenialIx,
} from "../../../../../lib/anchor-client";
import { getUsdcMint } from "../../../../../lib/solana";
import { checkLivePolicy, fetchAgentCard, fetchPact } from "../../../../../lib/account-decoder";
import { checkMerchantSasAttestation } from "../../../../../lib/sas";
import {
  addPriorityFeeAndTip,
  describeSubmissionMethod,
  sendAndConfirmViaHeliusSender,
} from "../../../../../lib/helius-sender";
import { mintReceiptCnft } from "../../../../../lib/cnft";
import { sealedBoxEncrypt } from "../../../../../lib/sealed-box";
import { sendPushToPubkey } from "../../../../../lib/web-push";
import { buildAssertTokenAccountAmountIx, isLighthouseEnabled } from "../../../../../lib/lighthouse";
import { computeCapabilityHashHex, type CapabilitySpec } from "../../../../../lib/capability-hash";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

/**
 * POST /api/x402/proxy/[merchant] — Settle x402 facilitator
 *
 * Headers (set by demo-agent or any x402-aware client):
 *   X-Settle-Credential       — settle:// envelope (base64url)
 *   X-Settle-Sig              — base58 ed25519 sig over canonical request
 *   X-Settle-Ts               — unix seconds
 *   X-Settle-Nonce            — 16-byte hex
 *   X-Settle-Request-Id       — UUID
 *   X-Settle-Capability-Hash  — 32-byte hex (must equal computeCapabilityHashHex(spec))
 *   X-Settle-Amount-Lamports  — decimal string (USDC base units, 6 decimals)
 *   X-Settle-Purpose          — utf-8 free text
 *   X-Settle-Pact-Pubkey      — REQUIRED for autonomous agent spend (spend_via_pact path).
 *                               If absent, falls back to authority-signed `spend` (legacy).
 *
 * Two modes:
 *   1. **Pact mode (recommended, autonomous):**
 *      - Pact pubkey provided
 *      - On-chain `spend_via_pact` ix; agent signs (= facilitator); Vault PDA executes
 *        the SPL transfer via program-derived signing.
 *      - User does NOT sign per-spend.
 *
 *   2. **Direct mode (legacy):**
 *      - No pact pubkey
 *      - On-chain `spend` ix; authority signs.
 *      - The facilitator must hold the authority's privkey (sandbox setup only).
 *
 * Strict-fail-closed config:
 *   - SUPABASE service-role key required (returns 503 otherwise)
 *   - UPSTASH (nonce + loop guards) required (returns 503 otherwise)
 *   - SETTLE_FACILITATOR_PRIVKEY required (returns 503 otherwise)
 */

interface MerchantEntry {
  upstream_url: string | null;
  description: string;
  capability_spec: CapabilitySpec;
  amount_lamports: string;
  /** Canned deliverable returned when upstream_url is null (demo fallback). */
  inline_deliverable: () => Record<string, unknown>;
}

function demoUpstream(slug: string): string | null {
  const base = process.env.DEMO_MERCHANTS_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/${slug}`;
}

const MERCHANT_REGISTRY: Record<string, MerchantEntry> = {
  "arxiv-fetch": {
    upstream_url: demoUpstream("arxiv-fetch"),
    description: "ArxivFetch — fetch a paper PDF",
    capability_spec: {
      domain: "arxiv-fetch.demo.settle",
      method: "POST",
      path: "/api/x402/proxy/arxiv-fetch",
      amount_lamports: "100000",
      version: 1,
    },
    amount_lamports: "100000",
    inline_deliverable: () => ({
      ok: true,
      merchant: "ArxivFetch",
      deliverable: {
        title: "Quantum decoherence and the emergence of classical physics",
        abstract:
          "We study quantum-to-classical transitions in many-body systems, demonstrating that decoherence rates scale exponentially with system size in the deep quantum regime…",
        pages: 18,
        lang_detected: "ja",
        content_url: "ipfs://demo-paper-jp",
      },
    }),
  },
  translate: {
    upstream_url: demoUpstream("translate"),
    description: "TranslateAPI — JA→EN translation",
    capability_spec: {
      domain: "translate.demo.settle",
      method: "POST",
      path: "/api/x402/proxy/translate",
      amount_lamports: "300000",
      version: 1,
    },
    amount_lamports: "300000",
    inline_deliverable: () => ({
      ok: true,
      merchant: "TranslateAPI",
      deliverable: {
        source_lang: "ja",
        target_lang: "en",
        pages_translated: 18,
        excerpt:
          "Quantum decoherence describes the loss of quantum coherence due to interaction with the environment. In macroscopic systems this transition produces what we observe as classical behavior…",
      },
    }),
  },
  summarize: {
    upstream_url: demoUpstream("summarize"),
    description: "SummaryLLM — ELI12 summary",
    capability_spec: {
      domain: "summarize.demo.settle",
      method: "POST",
      path: "/api/x402/proxy/summarize",
      amount_lamports: "50000",
      version: 1,
    },
    amount_lamports: "50000",
    inline_deliverable: () => ({
      ok: true,
      merchant: "SummaryLLM",
      deliverable: {
        audience: "eli12",
        summary:
          "Imagine a coin spinning on a table. While it's spinning fast, you can't tell which side will land up. But as soon as it touches the table and slows, gravity pulls one side down — that's a 'classical' result. Quantum decoherence is the math version of touching the table: tiny interactions with the environment force fuzzy quantum states to pick a definite answer.",
        word_count: 73,
      },
    }),
  },
};

function getRpcUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_RPC_URL;
  if (explicit) return explicit;
  const heliusKey = process.env.HELIUS_API_KEY;
  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
  if (heliusKey) return `https://${cluster}.helius-rpc.com/?api-key=${heliusKey}`;
  return clusterApiUrl(cluster === "mainnet" ? "mainnet-beta" : "devnet");
}

interface UpstashResp {
  result: number | string | null;
}
function upstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
async function upstash(command: string[]): Promise<UpstashResp | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const res = await fetch(`${url}/${command.join("/")}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as UpstashResp;
}

/** Canonical JSON for envelope (sorted keys, drop authority_sig). */
function canonicalEnvelopeBytes(envelope: Record<string, unknown>): Uint8Array {
  const { authority_sig: _omit, ...rest } = envelope;
  void _omit;
  const sorted = Object.fromEntries(Object.entries(rest).sort(([a], [b]) => a.localeCompare(b)));
  return new TextEncoder().encode(JSON.stringify(sorted));
}

function decodeCredential(cred: string): {
  v: number;
  card: string;
  agent_pubkey: string;
  expires_at: string;
  capabilities: string[];
  authority_sig: string;
} | null {
  if (!cred.startsWith("settle://")) return null;
  try {
    const b64 = cred.slice("settle://".length);
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ merchant: string }> },
) {
  // P10 — capture proxy entry timestamp once, immediately. All later timestamps are
  // recorded in this same process so subtractions are clock-drift-safe.
  const requestInitiatedAt = new Date();

  const { merchant: merchantSlug } = await params;
  const merchant = MERCHANT_REGISTRY[merchantSlug];
  if (!merchant) {
    return NextResponse.json({ error: "unknown_merchant", merchantSlug }, { status: 404 });
  }

  // ────────────────────────────────────────────────────────────────────
  // Critical infra preflight — fail loudly, no silent fallbacks.
  // ────────────────────────────────────────────────────────────────────
  if (!upstashConfigured()) {
    return NextResponse.json(
      {
        error: "upstash_unconfigured",
        message:
          "UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are required for nonce + loop guards. Refusing to spend without replay protection.",
      },
      { status: 503 },
    );
  }

  const headerCred = req.headers.get("x-settle-credential");
  const sigHeader = req.headers.get("x-settle-sig");
  const tsHeader = req.headers.get("x-settle-ts");
  const nonceHeader = req.headers.get("x-settle-nonce");
  const requestIdHeader = req.headers.get("x-settle-request-id") ?? randomUUID();
  const capabilityHashHeader = req.headers.get("x-settle-capability-hash");
  const amountHeader = req.headers.get("x-settle-amount-lamports");
  const purposeHeader = req.headers.get("x-settle-purpose") ?? "";
  const pactHeader = req.headers.get("x-settle-pact-pubkey");

  // 402 challenge if no credential — return the canonical capability hash so the agent
  // can include it on the next call.
  const expectedCapabilityHash = computeCapabilityHashHex(merchant.capability_spec);

  if (!headerCred) {
    return NextResponse.json(
      {
        error: "payment_required",
        merchant: merchant.description,
        amount_lamports: merchant.amount_lamports,
        capability_hash: expectedCapabilityHash,
        capability_spec: merchant.capability_spec,
      },
      {
        status: 402,
        headers: {
          "X-402-Required": "settle",
          "X-402-Amount-Lamports": merchant.amount_lamports,
          "X-402-Capability-Hash": expectedCapabilityHash,
        },
      },
    );
  }

  if (!sigHeader || !tsHeader || !nonceHeader || !capabilityHashHeader || !amountHeader) {
    return NextResponse.json({ error: "missing_x_settle_headers" }, { status: 400 });
  }

  const envelope = decodeCredential(headerCred);
  if (!envelope) {
    return NextResponse.json({ error: "credential_decode_failed" }, { status: 401 });
  }

  // ts skew + nonce replay guard
  const tsUnix = Number(tsHeader);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(tsUnix) || Math.abs(tsUnix - now) > 300) {
    return NextResponse.json({ error: "ts_skew" }, { status: 401 });
  }

  // Read raw body bytes (don't parse — sig is over raw bytes)
  const bodyBytes = new Uint8Array(await req.arrayBuffer());
  const bodyHashHex = Buffer.from(sha256(bodyBytes)).toString("hex");

  const path = req.nextUrl.pathname;
  const canonical = `${req.method}\n${path}\n${bodyHashHex}\n${tsUnix}\n${nonceHeader}`;
  const canonicalBytes = new TextEncoder().encode(canonical);

  // Per-request agent_sig
  let agentSigOk = false;
  try {
    const sigBytes = bs58.decode(sigHeader);
    const agentPubBytes = bs58.decode(envelope.agent_pubkey);
    agentSigOk = ed25519.verify(sigBytes, canonicalBytes, agentPubBytes);
  } catch {
    return NextResponse.json({ error: "agent_sig_decode_failed" }, { status: 401 });
  }
  if (!agentSigOk) {
    return NextResponse.json({ error: "agent_sig_invalid" }, { status: 401 });
  }

  // Fetch on-chain AgentCard
  const conn = new Connection(getRpcUrl(), { commitment: "confirmed" });
  let cardAccount;
  try {
    cardAccount = await fetchAgentCard(conn, new PublicKey(envelope.card));
  } catch (e) {
    return NextResponse.json(
      { error: "card_fetch_failed", message: (e as Error).message },
      { status: 502 },
    );
  }
  if (!cardAccount) {
    return NextResponse.json({ error: "card_not_found" }, { status: 404 });
  }

  // Authority-sig over canonical envelope
  let envelopeSigOk = false;
  try {
    const sigBytes = bs58.decode(envelope.authority_sig);
    envelopeSigOk = ed25519.verify(
      sigBytes,
      canonicalEnvelopeBytes(envelope),
      cardAccount.authority.toBytes(),
    );
  } catch {
    return NextResponse.json({ error: "authority_sig_decode_failed" }, { status: 401 });
  }
  if (!envelopeSigOk) {
    return NextResponse.json({ error: "authority_sig_invalid" }, { status: 401 });
  }

  // Cross-check envelope.agent_pubkey matches on-chain
  if (cardAccount.agentPubkey.toBase58() !== envelope.agent_pubkey) {
    return NextResponse.json(
      {
        error: "agent_pubkey_mismatch",
        on_chain: cardAccount.agentPubkey.toBase58(),
        in_envelope: envelope.agent_pubkey,
      },
      { status: 401 },
    );
  }

  // Capability hash must equal canonical for this merchant
  if (capabilityHashHeader.toLowerCase() !== expectedCapabilityHash.toLowerCase()) {
    return NextResponse.json(
      {
        error: "capability_hash_mismatch",
        deny_code: DenyCode.CapabilityNotPinned,
        expected: expectedCapabilityHash,
      },
      { status: 402 },
    );
  }
  if (amountHeader !== merchant.amount_lamports) {
    return NextResponse.json(
      {
        error: "amount_mismatch",
        deny_code: DenyCode.OverCap,
        expected: merchant.amount_lamports,
      },
      { status: 402 },
    );
  }

  // Nonce dedup (replay guard) — Upstash is mandatory, checked above
  const nonceKey = `nonce:${envelope.card}:${nonceHeader}`;
  const setRes = await upstash(["set", nonceKey, "1", "EX", "300", "NX"]);
  if (!setRes || setRes.result !== "OK") {
    return NextResponse.json({ error: "nonce_replay" }, { status: 409 });
  }

  // Loop guard (60s rolling, 3 attempts)
  const loopKey = `loop:${envelope.card}:${envelope.agent_pubkey}:${expectedCapabilityHash}:${amountHeader}`;
  const incr = await upstash(["incr", loopKey]);
  if (incr) {
    if (Number(incr.result) === 1) {
      await upstash(["expire", loopKey, "60"]);
    }
    if (Number(incr.result) > 3) {
      return NextResponse.json(
        {
          error: "loop_detected",
          deny_code: DenyCode.DuplicateOrLoopDetected,
          reason: "3+ same-merchant attempts in 60s",
        },
        { status: 402 },
      );
    }
  }

  // Live on-chain policy check
  const decisionSlot = await conn.getSlot("confirmed");
  const merchantPubkeyStr = process.env[`MERCHANT_PUBKEY_${merchantSlug.toUpperCase().replace(/-/g, "_")}`];
  if (!merchantPubkeyStr) {
    return NextResponse.json(
      { error: "merchant_pubkey_unconfigured", merchantSlug },
      { status: 503 },
    );
  }
  const merchantPubkey = new PublicKey(merchantPubkeyStr);

  // Optional: pact pubkey for autonomous agent spend
  let pactAccount = null;
  let pactPubkey: PublicKey | null = null;
  if (pactHeader) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pactHeader)) {
      return NextResponse.json({ error: "invalid_pact_pubkey" }, { status: 400 });
    }
    try {
      pactPubkey = new PublicKey(pactHeader);
      pactAccount = await fetchPact(conn, pactPubkey);
      if (!pactAccount) {
        return NextResponse.json({ error: "pact_not_found" }, { status: 404 });
      }
      if (pactAccount.parentCard.toBase58() !== envelope.card) {
        return NextResponse.json({ error: "pact_card_mismatch" }, { status: 400 });
      }
    } catch (e) {
      return NextResponse.json(
        { error: "pact_fetch_failed", message: (e as Error).message },
        { status: 502 },
      );
    }
  }

  const livePolicyRaw = checkLivePolicy({
    card: cardAccount,
    pact: pactAccount,
    merchant: merchantPubkey,
    amountLamports: BigInt(amountHeader),
    capabilityHashHex: expectedCapabilityHash,
    currentSlot: BigInt(decisionSlot),
  });

  // SAS merchant attestation (with Supabase verified_merchants fallback)
  const sasResult = await checkMerchantSasAttestation(conn, merchantPubkey);
  let merchantVerified = sasResult.verified;
  let merchantVerifiedSource: string = sasResult.source;
  if (sasResult.source === "trusted_db") {
    // SAS unconfigured — actually look up Supabase verified_merchants for this pubkey.
    const sUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const sKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (sUrl && sKey) {
      try {
        const sb = createClient(sUrl, sKey, { auth: { persistSession: false } });
        const { data: vm } = await sb
          .from("verified_merchants")
          .select("merchant_pubkey, revoked_at, verification_method")
          .eq("merchant_pubkey", merchantPubkeyStr)
          .maybeSingle();
        merchantVerified = Boolean(vm && !vm.revoked_at);
        merchantVerifiedSource = merchantVerified
          ? `trusted_db:${vm?.verification_method ?? "unknown"}`
          : "not_verified";
      } catch {
        merchantVerified = false;
        merchantVerifiedSource = "supabase_lookup_failed";
      }
    } else {
      // No SAS, no Supabase — refuse to claim verified.
      merchantVerified = false;
      merchantVerifiedSource = "no_verification_source";
    }
  }

  const livePolicy = !merchantVerified
    ? {
        denyCode: DenyCode.MerchantNotVerified,
        reason: `merchant not verified (source: ${merchantVerifiedSource})`,
        capRemainingAfter: 0n,
      }
    : livePolicyRaw;

  // Build canonical receipt + reason + policy snapshot → hash chain
  const cardPubkey = envelope.card;
  const purposeText = purposeHeader || "no purpose stated";
  const isAllow = livePolicy.denyCode === null;

  const receipt: CanonicalReceipt = {
    request_id: requestIdHeader,
    card_pubkey: cardPubkey,
    pact_pubkey: pactPubkey ? pactPubkey.toBase58() : null,
    merchant_pubkey: merchantPubkeyStr,
    amount_lamports: amountHeader,
    capability_hash: expectedCapabilityHash,
    purpose_text_hash: bytesToHex(blake3(new TextEncoder().encode(purposeText))),
    decision_slot: decisionSlot,
    policy_version: cardAccount.policyVersion,
  };

  const reason: CanonicalReason = {
    decision: isAllow ? "ALLOW" : "DENY",
    deny_code: livePolicy.denyCode ?? 0,
    cap_remaining_after: livePolicy.capRemainingAfter.toString(),
    per_call_max: cardAccount.perCallMaxLamports.toString(),
    allowlist_match: cardAccount.allowlist.some(
      (e) => e.merchant.toBase58() === merchantPubkeyStr,
    ),
    capability_pinned: cardAccount.allowlist.some(
      (e) =>
        e.merchant.toBase58() === merchantPubkeyStr &&
        e.capabilityHash !== null &&
        e.capabilityHash.toString("hex").toLowerCase() === expectedCapabilityHash.toLowerCase(),
    ),
    merchant_verified: merchantVerified,
    expiry_slot: Number(cardAccount.expirySlot),
    current_slot: decisionSlot,
  };

  const policySnapshot: CanonicalPolicySnapshot = {
    policy_version: cardAccount.policyVersion,
    daily_cap: cardAccount.dailyCapLamports.toString(),
    per_call_max: cardAccount.perCallMaxLamports.toString(),
    allowlist_count: cardAccount.allowlist.length,
    expiry_slot: Number(cardAccount.expirySlot),
    revoked: cardAccount.revoked,
  };

  const built = buildReceiptHashes({
    receipt,
    reason,
    policy_snapshot: policySnapshot,
    http: { method: "POST", path },
  });

  // ────────────────────────────────────────────────────────────────────
  // Facilitator key — required.
  // ────────────────────────────────────────────────────────────────────
  const facilitatorB58 = process.env.SETTLE_FACILITATOR_PRIVKEY;
  if (!facilitatorB58) {
    return NextResponse.json(
      {
        error: "facilitator_key_not_configured",
        message: "Set SETTLE_FACILITATOR_PRIVKEY env var.",
      },
      { status: 503 },
    );
  }

  let facilitator: Keypair;
  try {
    facilitator = Keypair.fromSecretKey(bs58.decode(facilitatorB58));
  } catch {
    return NextResponse.json(
      { error: "facilitator_key_decode_failed" },
      { status: 503 },
    );
  }

  // Early-deny short-circuit — submit record_denial with merchant + pact context
  if (!isAllow) {
    let denialSig: string | null = null;
    try {
      // record_denial accepts EITHER card.authority OR card.agent_pubkey as signer
      // (program-side constraint). So pact-mode DENYs (where facilitator == agent)
      // also land on-chain — closing the unified-ledger gap.
      const facilitatorIsAuthority = facilitator.publicKey.equals(cardAccount.authority);
      const facilitatorIsAgent = facilitator.publicKey.equals(cardAccount.agentPubkey);
      if (facilitatorIsAuthority || facilitatorIsAgent) {
        const denialIx = recordDenialIx({
          signer: facilitator.publicKey,
          card: new PublicKey(cardPubkey),
          args: {
            denyCode: livePolicy.denyCode ?? 0,
            merchant: merchantPubkey,
            pact: pactPubkey ?? PublicKey.default,
            receiptHash: Buffer.from(built.hashes.receipt_hash, "hex"),
            reasonHash: Buffer.from(built.hashes.reason_hash, "hex"),
            policySnapshotHash: Buffer.from(built.hashes.policy_snapshot_hash, "hex"),
          },
        });
        const denyTx = new Transaction().add(denialIx);
        const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
        denyTx.recentBlockhash = blockhash;
        denyTx.lastValidBlockHeight = lastValidBlockHeight;
        denyTx.feePayer = facilitator.publicKey;
        denyTx.sign(facilitator);

        denialSig = await sendAndConfirmViaHeliusSender(conn, denyTx, {
          blockhash,
          lastValidBlockHeight,
          skipPreflight: true,
          maxRetries: 0,
        });
      } else {
        console.warn(
          "[x402-proxy] record_denial skipped: facilitator is neither card.authority nor card.agent_pubkey",
        );
      }
    } catch (e) {
      console.warn("[x402-proxy] record_denial failed:", (e as Error).message);
    }

    // Persist the DENY receipt (canonical reason + policy_snapshot for honest verify).
    // Timing: only the entry timestamp; the upstream merchant call is skipped on DENY.
    await persistReceipt({
      requestId: requestIdHeader,
      cardPubkey,
      pactPubkey: pactPubkey ? pactPubkey.toBase58() : null,
      merchantPubkey: merchantPubkeyStr,
      amountLamports: amountHeader,
      decision: "DENY",
      denyCode: livePolicy.denyCode ?? null,
      capabilityHashHex: expectedCapabilityHash,
      hashes: built.hashes,
      sig: denialSig,
      decisionSlot,
      policyVersion: cardAccount.policyVersion,
      targetMethod: "POST",
      targetPath: path,
      canonicalReason: reason,
      canonicalPolicy: policySnapshot,
      purposeText,
      merchantSlug,
      deliverable: null,
      requestInitiatedAt,
    });

    return NextResponse.json(
      {
        error: "denied",
        decision: "DENY",
        deny_code: livePolicy.denyCode,
        reason: livePolicy.reason,
        receipt_hash: built.hashes.receipt_hash,
        reason_hash: built.hashes.reason_hash,
        policy_snapshot_hash: built.hashes.policy_snapshot_hash,
        purpose_hash: built.hashes.purpose_hash,
        denial_signature: denialSig,
      },
      { status: 402 },
    );
  }

  // ────────────────────────────────────────────────────────────────────
  // Build + submit spend ix.
  //
  // Pact mode: facilitator signs as agent (must equal card.agent_pubkey).
  // Direct mode: facilitator signs as authority (must equal card.authority).
  // ────────────────────────────────────────────────────────────────────
  let spendSig: string | null = null;
  try {
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");

    if (pactAccount && pactPubkey) {
      // Pact mode — agent signs, vault PDA executes transfer.
      if (!facilitator.publicKey.equals(cardAccount.agentPubkey)) {
        return NextResponse.json(
          {
            error: "facilitator_agent_mismatch",
            message:
              "SETTLE_FACILITATOR_PRIVKEY does not match card.agent_pubkey. Pact mode requires the facilitator to BE the agent.",
            card_agent: cardAccount.agentPubkey.toBase58(),
            facilitator: facilitator.publicKey.toBase58(),
          },
          { status: 503 },
        );
      }

      const ix = spendViaPactIxWithAtas({
        agent: facilitator.publicKey,
        feePayer: facilitator.publicKey,
        card: new PublicKey(cardPubkey),
        pact: pactPubkey,
        usdcMint: new PublicKey(getUsdcMint()),
        args: {
          amount: BigInt(amountHeader),
          merchantOwner: merchantPubkey,
          capabilityHash: Buffer.from(expectedCapabilityHash, "hex"),
          receiptHash: Buffer.from(built.hashes.receipt_hash, "hex"),
          reasonHash: Buffer.from(built.hashes.reason_hash, "hex"),
          policySnapshotHash: Buffer.from(built.hashes.policy_snapshot_hash, "hex"),
        },
      });

      const tx = new Transaction().add(ix);

      if (isLighthouseEnabled()) {
        const usdcMint = new PublicKey(getUsdcMint());
        const merchantUsdc = getAssociatedTokenAddressSync(usdcMint, merchantPubkey);
        // Defense-in-depth: assert that merchant balance after transfer is at most
        // (current_balance + amount). Prevents a malicious extra ix from inflating.
        const assertIx = buildAssertTokenAccountAmountIx({
          tokenAccount: merchantUsdc,
          expectedAmount: BigInt(amountHeader),
          operator: "lte",
        });
        if (assertIx) tx.add(assertIx);
      }

      addPriorityFeeAndTip({
        tx,
        microLamportsPerCu: 5_000,
        computeUnitLimit: 350_000,
        jitoTipLamports: 200_000,
        feePayer: facilitator.publicKey,
      });

      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = facilitator.publicKey;
      tx.sign(facilitator);

      spendSig = await sendAndConfirmViaHeliusSender(conn, tx, {
        blockhash,
        lastValidBlockHeight,
        skipPreflight: true,
        maxRetries: 0,
      });
    } else {
      // Direct mode — authority signs.
      if (!facilitator.publicKey.equals(cardAccount.authority)) {
        return NextResponse.json(
          {
            error: "facilitator_authority_mismatch",
            message:
              "SETTLE_FACILITATOR_PRIVKEY does not match card.authority. Either provide X-Settle-Pact-Pubkey for autonomous mode, or set the facilitator key to the card's authority.",
            card_authority: cardAccount.authority.toBase58(),
            facilitator: facilitator.publicKey.toBase58(),
          },
          { status: 503 },
        );
      }

      const ix = spendIxWithAtas({
        authority: facilitator.publicKey,
        card: new PublicKey(cardPubkey),
        usdcMint: new PublicKey(getUsdcMint()),
        args: {
          amount: BigInt(amountHeader),
          merchantOwner: merchantPubkey,
          capabilityHash: Buffer.from(expectedCapabilityHash, "hex"),
          receiptHash: Buffer.from(built.hashes.receipt_hash, "hex"),
          reasonHash: Buffer.from(built.hashes.reason_hash, "hex"),
          policySnapshotHash: Buffer.from(built.hashes.policy_snapshot_hash, "hex"),
        },
      });

      const tx = new Transaction().add(ix);

      if (isLighthouseEnabled()) {
        const usdcMint = new PublicKey(getUsdcMint());
        const merchantUsdc = getAssociatedTokenAddressSync(usdcMint, merchantPubkey);
        const assertIx = buildAssertTokenAccountAmountIx({
          tokenAccount: merchantUsdc,
          expectedAmount: BigInt(amountHeader),
          operator: "lte",
        });
        if (assertIx) tx.add(assertIx);
      }

      addPriorityFeeAndTip({
        tx,
        microLamportsPerCu: 5_000,
        computeUnitLimit: 250_000,
        jitoTipLamports: 200_000,
        feePayer: facilitator.publicKey,
      });

      tx.recentBlockhash = blockhash;
      tx.lastValidBlockHeight = lastValidBlockHeight;
      tx.feePayer = facilitator.publicKey;
      tx.sign(facilitator);

      spendSig = await sendAndConfirmViaHeliusSender(conn, tx, {
        blockhash,
        lastValidBlockHeight,
        skipPreflight: true,
        maxRetries: 0,
      });
    }
  } catch (e) {
    return NextResponse.json(
      {
        error: "spend_ix_failed",
        message: (e as Error).message,
        receipt_hash: built.hashes.receipt_hash,
      },
      { status: 502 },
    );
  }

  // Forward to merchant (or use canned deliverable when no upstream is configured).
  // Capture call/return timestamps for capability_leaderboard either way so the
  // P10 timing fields stay consistent.
  let merchantResp: unknown;
  const upstreamCalledAt = new Date();
  let upstreamReturnedAt: Date | undefined;
  if (merchant.upstream_url) {
    try {
      const upstreamRes = await fetch(merchant.upstream_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Settle-Credential": headerCred,
        },
        body: bodyBytes,
      });
      merchantResp = await upstreamRes.json();
      upstreamReturnedAt = new Date();
    } catch (e) {
      return NextResponse.json(
        { error: "merchant_fetch_failed", message: (e as Error).message },
        { status: 502 },
      );
    }
  } else {
    // Inline canned deliverable. The proxy IS the demo merchant in this mode —
    // the spend ix and receipt-hash chain above are still real and on-chain.
    merchantResp = merchant.inline_deliverable();
    upstreamReturnedAt = new Date();
  }

  // Persist receipt with canonical reason + policy_snapshot for honest verify.
  // P10 — full timing trio: proxy entry, upstream call boundaries.
  await persistReceipt({
    requestId: requestIdHeader,
    cardPubkey,
    pactPubkey: pactPubkey ? pactPubkey.toBase58() : null,
    merchantPubkey: merchantPubkeyStr,
    amountLamports: amountHeader,
    decision: "ALLOW",
    denyCode: null,
    capabilityHashHex: expectedCapabilityHash,
    hashes: built.hashes,
    sig: spendSig,
    decisionSlot,
    policyVersion: cardAccount.policyVersion,
    targetMethod: "POST",
    targetPath: path,
    canonicalReason: reason,
    canonicalPolicy: policySnapshot,
    purposeText,
    merchantSlug,
    deliverable:
      typeof merchantResp === "object" && merchantResp !== null && "deliverable" in merchantResp
        ? (merchantResp as { deliverable?: unknown }).deliverable
        : null,
    requestInitiatedAt,
    upstreamCalledAt,
    upstreamReturnedAt,
  });

  // cNFT receipt mint (best-effort)
  let cnftMint: Awaited<ReturnType<typeof mintReceiptCnft>> = null;
  try {
    cnftMint = await mintReceiptCnft({
      recipient: cardAccount.authority.toBase58(),
      merchant: merchantSlug,
      amountUsdc: (Number(amountHeader) / 1_000_000).toFixed(2),
      capabilityHash: expectedCapabilityHash,
      receiptIndex: decisionSlot,
    });
  } catch (e) {
    console.warn("[x402-proxy] cnft mint failed (non-fatal):", (e as Error).message);
  }

  // Push notification (best-effort) — F1 amount-scaled.
  // For $50+ spends we send an extra-emphatic "BIG TIP" / "BIG SPEND" push so the recipient's
  // OS-level notification draws the eye. Threshold lives in lib/confetti so client + server
  // celebrate together.
  try {
    const usdcNumber = Number(amountHeader) / 1_000_000;
    const usdcAmount = usdcNumber.toFixed(2);
    const isBig = usdcNumber >= 50;
    await sendPushToPubkey(cardAccount.authority.toBase58(), {
      title: isBig ? `★ Big spend · $${usdcAmount}` : "Receipt landed",
      body: `Demo Agent spent $${usdcAmount} USDC at ${merchantSlug}`,
      url: `/receipts/${requestIdHeader}`,
    });
  } catch (e) {
    console.warn("[x402-proxy] push send failed (non-fatal):", (e as Error).message);
  }

  return NextResponse.json({
    ok: true,
    decision: "ALLOW",
    request_id: requestIdHeader,
    merchant: merchantSlug,
    deliverable: merchantResp,
    receipt_hash: built.hashes.receipt_hash,
    reason_hash: built.hashes.reason_hash,
    policy_snapshot_hash: built.hashes.policy_snapshot_hash,
    purpose_hash: built.hashes.purpose_hash,
    purpose_text_hash: built.hashes.purpose_text_hash,
    spend_signature: spendSig,
    pact: pactPubkey ? pactPubkey.toBase58() : null,
    cnft: cnftMint,
    // Honest claim: tx submission path. helius_sender_jito = posted as Jito bundle
    // via Helius Sender (HELIUS_API_KEY configured); rpc_fallback = vanilla RPC
    // sendRawTransaction (Sender unavailable).
    submission_method: describeSubmissionMethod("proxy"),
  });
}

interface PersistInput {
  requestId: string;
  cardPubkey: string;
  pactPubkey: string | null;
  merchantPubkey: string;
  amountLamports: string;
  decision: "ALLOW" | "DENY" | "REVIEW";
  denyCode: DenyCodeValue | null;
  capabilityHashHex: string;
  hashes: ReturnType<typeof buildReceiptHashes>["hashes"];
  sig: string | null;
  decisionSlot: number;
  policyVersion: number;
  targetMethod: string;
  targetPath: string;
  canonicalReason: CanonicalReason;
  canonicalPolicy: CanonicalPolicySnapshot;
  purposeText: string;
  merchantSlug: string;
  deliverable: unknown;
  /** P10 timing — populated by the proxy in the same process. */
  requestInitiatedAt?: Date;
  upstreamCalledAt?: Date;
  upstreamReturnedAt?: Date;
  /** True if the merchant or the user opted this receipt into the public feed (F18). */
  publicFeed?: boolean;
}

async function persistReceipt(input: PersistInput): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) return;
  try {
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const encryptedMetadata = sealedBoxEncrypt(
      JSON.stringify({
        purpose: input.purposeText,
        merchant_slug: input.merchantSlug,
        deliverable_summary: input.deliverable,
      }),
    );

    // Insert + select-back: we need to know the resolved public_feed value (which the
    // pre-insert trigger may set from agent_cards.public_feed_default) so we can decide
    // whether to fan out push notifications below.
    const { data: inserted, error } = await supabase
      .from("receipts")
      .insert({
        request_id: input.requestId,
        card_pubkey: input.cardPubkey,
        pact_pubkey: input.pactPubkey,
        merchant_pubkey: input.merchantPubkey,
        amount_lamports: input.amountLamports,
        decision: input.decision,
        deny_code: input.denyCode,
        capability_hash: `\\x${input.capabilityHashHex}`,
        purpose_text_hash: `\\x${input.hashes.purpose_text_hash}`,
        purpose_hash: `\\x${input.hashes.purpose_hash}`,
        receipt_hash: `\\x${input.hashes.receipt_hash}`,
        reason_hash: `\\x${input.hashes.reason_hash}`,
        policy_snapshot_hash: `\\x${input.hashes.policy_snapshot_hash}`,
        canonical_reason_json: input.canonicalReason,
        canonical_policy_json: input.canonicalPolicy,
        encrypted_metadata: encryptedMetadata
          ? `\\x${encryptedMetadata.toString("hex")}`
          : null,
        sig_solscan: input.sig,
        decision_slot: input.decisionSlot,
        policy_version: input.policyVersion,
        target_method: input.targetMethod,
        target_path: input.targetPath,
        // P10 — server-clock timing for capability_leaderboard.
        request_initiated_at: input.requestInitiatedAt?.toISOString() ?? null,
        upstream_called_at: input.upstreamCalledAt?.toISOString() ?? null,
        upstream_returned_at: input.upstreamReturnedAt?.toISOString() ?? null,
        // Caller may force public_feed=true. If left false/undefined, the
        // set_receipt_public_feed BEFORE INSERT trigger fills it from
        // agent_cards.public_feed_default.
        public_feed: input.publicFeed ?? false,
      })
      .select("public_feed")
      .maybeSingle();
    if (error) {
      console.warn("[x402-proxy] receipt insert failed:", error.message);
    }

    // F16 — fan out push notifications to followers when a public_feed receipt lands.
    // Best-effort and non-blocking from the user's perspective: we await it so that
    // the function's persistence guarantees still hold, but errors per-subscription
    // are swallowed inside sendPushToPubkey.
    const resolvedPublicFeed = Boolean(inserted?.public_feed);
    if (input.decision === "ALLOW" && resolvedPublicFeed) {
      try {
        const { data: followers } = await supabase
          .from("follows")
          .select("follower_pubkey")
          .eq("following_pubkey", input.merchantPubkey)
          .eq("push_on_receipt", true);
        if (followers && followers.length > 0) {
          const { sendPushToPubkey } = await import("../../../../../lib/web-push");
          const amountUsd = (Number(input.amountLamports) / 1_000_000).toFixed(2);
          const payload = {
            title: `${input.merchantSlug} just earned $${amountUsd}`,
            body: `${input.purposeText.slice(0, 80)}${input.purposeText.length > 80 ? "…" : ""}`,
            url: `/receipts/${input.requestId}`,
          };
          await Promise.all(
            followers.map((row) =>
              sendPushToPubkey(row.follower_pubkey as string, payload).catch(() => {}),
            ),
          );
        }
      } catch (e) {
        console.warn("[x402-proxy] follower push fanout failed:", (e as Error).message);
      }
    }
  } catch (e) {
    console.warn("[x402-proxy] supabase error:", (e as Error).message);
  }
}
