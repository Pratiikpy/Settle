#!/usr/bin/env tsx
/**
 * F9.3 — Solana Pay → Settle federation bridge.
 *
 * Takes a Solana Pay tx signature, fetches the on-chain transfer,
 * builds a federation payload with our facilitator attestation, and
 * POSTs to /api/federation/import. After this, the tx appears in
 * `federated_receipts` (status='untrusted' until an admin promotes
 * the origin) alongside Settle-native receipts.
 *
 * Usage:
 *   pnpm tsx scripts/federation-bridge-solana-pay.ts \
 *     --sig 5jK... \
 *     --base http://localhost:3000
 *
 * Why this exists alongside `/api/import/solana-pay`:
 *   - The existing importer puts receipts in `imported_receipts` —
 *     a Settle-native table for "we know about these but they didn't
 *     come from our facilitator."
 *   - This bridge instead routes through `federated_receipts` with a
 *     real Ed25519 attestation. That gives us the same provenance
 *     guarantees we'd ask of an EXTERNAL protocol — useful for
 *     pressure-testing the federation pipeline with a known input.
 */

import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { sha256 } from "@noble/hashes/sha2";
import { Connection, ParsedTransactionWithMeta } from "@solana/web3.js";
import { readFileSync } from "node:fs";

interface Args {
  sig: string;
  base: string;
  rpc: string;
  origin: string;
}

function parseArgs(): Args {
  const args: Args = {
    sig: "",
    base: "http://localhost:3000",
    rpc: "https://api.devnet.solana.com",
    origin: "solana-pay.bridge",
  };
  for (let i = 2; i < process.argv.length; i += 1) {
    const a = process.argv[i];
    const next = process.argv[i + 1];
    if (a === "--sig" && next) {
      args.sig = next;
      i += 1;
    } else if (a === "--base" && next) {
      args.base = next;
      i += 1;
    } else if (a === "--rpc" && next) {
      args.rpc = next;
      i += 1;
    } else if (a === "--origin" && next) {
      args.origin = next;
      i += 1;
    }
  }
  if (!args.sig) {
    console.error("usage: --sig <tx_sig> [--base <url>] [--rpc <url>] [--origin <id>]");
    process.exit(2);
  }
  return args;
}

function loadDotEnvLocal(): Record<string, string> {
  try {
    return readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .reduce<Record<string, string>>((acc, line) => {
        const [k, ...rest] = line.split("=");
        if (k) acc[k.trim()] = rest.join("=").trim();
        return acc;
      }, {});
  } catch {
    return {};
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonical(obj[k])).join(",") + "}";
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b)
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Best-effort: walk the parsed tx instructions, find the first
 * SPL Token TransferChecked, return { sender, recipient, amount }.
 */
function extractTransfer(tx: ParsedTransactionWithMeta): {
  sender: string | null;
  recipient: string | null;
  amount_lamports: string | null;
  asset: string;
} {
  const ixs = tx.transaction.message.instructions;
  for (const ix of ixs) {
    if ("parsed" in ix && ix.parsed) {
      const parsed = ix.parsed as { type?: string; info?: Record<string, unknown> };
      if (parsed.type === "transferChecked" || parsed.type === "transfer") {
        const info = parsed.info ?? {};
        const sender =
          (info.source as string | undefined) ?? (info.authority as string | undefined) ?? null;
        const recipient = (info.destination as string | undefined) ?? null;
        const amount = info.tokenAmount as { amount?: string } | undefined;
        return {
          sender,
          recipient,
          amount_lamports: amount?.amount ?? (info.amount as string | undefined) ?? null,
          asset: "USDC",
        };
      }
    }
  }
  return { sender: null, recipient: null, amount_lamports: null, asset: "USDC" };
}

async function main() {
  const args = parseArgs();
  const env = { ...loadDotEnvLocal(), ...process.env };

  const facilitatorB58 = env.SETTLE_FACILITATOR_PRIVKEY;
  if (!facilitatorB58) {
    console.error("[bridge] SETTLE_FACILITATOR_PRIVKEY not set in env");
    process.exit(2);
  }
  const sk = bs58.decode(facilitatorB58);
  // Solana keypairs are 64 bytes (32 priv + 32 pub). Ed25519 raw priv is the first 32.
  const ed25519Priv = sk.length === 64 ? sk.slice(0, 32) : sk;
  const pk = ed25519.getPublicKey(ed25519Priv);
  const pkB58 = bs58.encode(pk);

  console.log("[bridge] facilitator pubkey:", pkB58);
  console.log("[bridge] fetching tx:", args.sig);

  const conn = new Connection(args.rpc, "confirmed");
  const tx = await conn.getParsedTransaction(args.sig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!tx) {
    console.error("[bridge] tx not found on-chain");
    process.exit(1);
  }

  const transfer = extractTransfer(tx);
  if (!transfer.sender || !transfer.recipient || !transfer.amount_lamports) {
    console.error("[bridge] could not extract transfer fields:", transfer);
    process.exit(1);
  }

  const payload = {
    sender_pubkey: transfer.sender,
    recipient_pubkey: transfer.recipient,
    amount_lamports: transfer.amount_lamports,
    asset: transfer.asset,
    source: "solana_pay",
    onchain_signature: args.sig,
    block_time: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null,
  };

  const canonicalStr = canonical(payload);
  const payloadHash = bytesToHex(sha256(new TextEncoder().encode(canonicalStr)));
  console.log("[bridge] payload_hash:", payloadHash);

  const message = `${payloadHash}|${args.origin}|${args.sig}`;
  const sig = ed25519.sign(new TextEncoder().encode(message), ed25519Priv);
  const sigB58 = bs58.encode(sig);

  const importUrl = `${args.base}/api/federation/import`;
  const res = await fetch(importUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin_id: args.origin,
      remote_request_id: args.sig,
      payload,
      attestation_sig_b58: sigB58,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    console.error("[bridge] import failed:", res.status, json);
    process.exit(1);
  }
  console.log("[bridge] [OK] imported");
  console.log("  federated_id:", json.federated_receipt.federated_id);
  console.log("  status:      ", json.federated_receipt.status);
  console.log("  trusted?     ", json.trusted);
  if (!json.trusted) {
    console.log(
      "[bridge] hint: row landed as 'untrusted' because origin trusted=false. promote via:",
    );
    console.log(
      `  UPDATE federation_origins SET trusted=true WHERE origin_id='${args.origin}';`,
    );
  }
}

main().catch((e) => {
  console.error("[bridge] fatal:", e);
  process.exit(1);
});
