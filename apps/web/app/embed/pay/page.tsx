"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";
import { TrustScoreBadge } from "@settle/ui";
import { fireSettlementConfetti } from "../../../lib/confetti";

/**
 * D2 — `/embed/pay` — iframe target for the `<settle-pay>` web component.
 *
 * The host page mounts `<settle-pay merchant="…" amount="…">` which
 * opens an iframe at this route. The iframe runs Settle's wallet
 * connect + sign flow in our origin so the host page never touches
 * keypairs.
 *
 * Difference vs `/pay/widget`:
 *   - `/pay/widget` is opened via window.open() — postMessages target
 *     `window.opener` and the page calls `window.close()` on success.
 *   - `/embed/pay` runs INSIDE an iframe — postMessages target
 *     `window.parent` and we let the host dispose the iframe by
 *     reacting to the `settle:closed` event.
 *
 * Message envelope (matches what `<settle-pay>` listens for in
 * `packages/web-components/src/pay.ts`):
 *
 *   { type: "settle:paid",   request_id, receipt_hash }
 *   { type: "settle:error",  code, message }
 *   { type: "settle:closed" }
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HEX64_RE = /^[0-9a-f]{64}$/i;

type Status = "ready" | "signing" | "confirming" | "success" | "error";

interface PaidMessage {
  type: "settle:paid";
  request_id: string;
  receipt_hash: string | null;
}
interface ErrorMessage {
  type: "settle:error";
  code: string;
  message: string;
}
interface ClosedMessage {
  type: "settle:closed";
}

export default function EmbedPayPage() {
  const params = useSearchParams();
  const merchant = params.get("merchant") ?? "";
  const amount = params.get("amount") ?? "";
  const note = params.get("note") ?? "";
  const capability = params.get("capability") ?? "";
  const { connected, publicKey, signTransaction } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { connection } = useConnection();

  const [status, setStatus] = useState<Status>("ready");
  const [error, setError] = useState<string | null>(null);
  const closedRef = useRef(false);

  const valid = useMemo(() => {
    if (!PUBKEY_RE.test(merchant)) return false;
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return false;
    if (capability && !HEX64_RE.test(capability)) return false;
    return true;
  }, [merchant, amount, capability]);

  function postToParent(msg: PaidMessage | ErrorMessage | ClosedMessage): void {
    try {
      // Parent origin is unknown to us at runtime — `<settle-pay>`
      // origin-validates incoming messages on its side, so we send
      // with "*" and rely on the receiver to filter. Acceptable
      // because we only emit non-secret state (request_id, hash).
      window.parent?.postMessage(msg, "*");
    } catch {
      // ignore — host may have detached
    }
  }

  // Notify parent on unload if the user dismissed without paying.
  useEffect(() => {
    function onUnload(): void {
      if (!closedRef.current && status !== "success") {
        postToParent({ type: "settle:closed" });
      }
    }
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [status]);

  async function handlePay(): Promise<void> {
    if (!connected || !publicKey || !signTransaction) {
      setError("Connect a wallet first.");
      return;
    }
    setStatus("signing");
    setError(null);
    try {
      const idempotencyKey = crypto.randomUUID();
      // /api/send/build was the legacy endpoint; the swap-aware route
      // /api/swap/quote-and-build supersedes it (handles direct USDC,
      // multi-token, and writes the receipt index — see Bug #10 fix).
      // direct_usdc path requires inputMint = USDC + inputAmountAtomic in lamports.
      const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
      const inputAmountAtomic = String(Math.round(parseFloat(amount) * 1_000_000));
      const buildRes = await fetch("/api/swap/quote-and-build", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from: publicKey.toBase58(),
          to: merchant,
          inputMint: USDC_DEVNET_MINT,
          inputAmountAtomic,
          note: note || undefined,
        }),
      });
      let built: {
        ok?: boolean;
        transaction?: string;
        blockhash?: string;
        last_valid_block_height?: number;
        message?: string;
        error?: string;
        receipt?: { request_id?: string; hashes?: { receipt_hash?: string } };
      };
      try {
        built = await buildRes.json();
      } catch {
        // Defensive: if the API returns HTML (e.g. 404 page), surface a
        // clean error rather than a JSON parse stacktrace.
        throw new Error(`build_failed_http_${buildRes.status}`);
      }
      if (!built.ok || !built.transaction) {
        throw new Error(built.message ?? built.error ?? "build_failed");
      }

      const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
      const signed = await signTransaction(tx);
      setStatus("confirming");

      const sig = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: built.blockhash!,
          lastValidBlockHeight: built.last_valid_block_height!,
        },
        "confirmed",
      );

      setStatus("success");
      fireSettlementConfetti();

      postToParent({
        type: "settle:paid",
        request_id: built.receipt?.request_id ?? "",
        receipt_hash: built.receipt?.hashes?.receipt_hash ?? null,
      });
      closedRef.current = true;
    } catch (e) {
      const message = (e as Error).message ?? "payment_failed";
      setStatus("error");
      setError(message);
      postToParent({
        type: "settle:error",
        code: "payment_failed",
        message,
      });
    }
  }

  if (!valid) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 py-8">
        <div className="max-w-sm text-center">
          <h1 className="text-lg font-semibold">Invalid pay request</h1>
          <p className="mt-3 text-xs text-[#52525b]">
            Required: <code>merchant</code> (base58 pubkey) and{" "}
            <code>amount</code> (positive USDC decimal).
          </p>
          <button
            type="button"
            onClick={() => {
              postToParent({
                type: "settle:error",
                code: "invalid_params",
                message: "merchant + amount required",
              });
              postToParent({ type: "settle:closed" });
            }}
            className="mt-4 rounded-full border border-[#e4e4e7] px-4 py-2 text-xs"
          >
            Close
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col px-5 py-6">
      <div className="rounded-3xl border border-[#e4e4e7] bg-white/[0.03] p-5">
        <div className="text-[10px] uppercase tracking-wide text-[#71717a]">
          Pay with Settle
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight">${amount}</span>
          <span className="text-sm text-[#52525b]">USDC</span>
        </div>

        <div className="mt-5 grid grid-cols-[64px,1fr] gap-y-3 text-xs">
          <span className="text-[#71717a]">to</span>
          <div className="flex items-center gap-2">
            <code className="font-mono text-[#27272a]">
              {merchant.slice(0, 8)}…{merchant.slice(-6)}
            </code>
            <TrustScoreBadge pubkey={merchant} variant="compact" />
          </div>
          {note && (
            <>
              <span className="text-[#71717a]">note</span>
              <span className="text-[#27272a] break-words">{note}</span>
            </>
          )}
          {capability && (
            <>
              <span className="text-[#71717a]">capability</span>
              <code className="break-all font-mono text-[10px] text-[#52525b]">
                {capability.slice(0, 16)}…
              </code>
            </>
          )}
        </div>

        {!connected ? (
          // Bug #44 fix: previously said "Connect a wallet (top right)
          // to continue." but the embed has no top-right wallet button —
          // it's meant to be iframed. When loaded standalone the hint
          // pointed to nothing. Now show an inline connect button so
          // both iframed and standalone modes work cleanly.
          <button
            type="button"
            onClick={() => setWalletModalVisible(true)}
            className="mt-6 w-full rounded-full bg-accent py-3 text-sm font-medium text-background"
          >
            Connect wallet to pay
          </button>
        ) : status === "success" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.05] p-4 text-center text-xs text-emerald-300">
            Paid ✓ — host page notified.
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handlePay()}
            disabled={status === "signing" || status === "confirming"}
            className="mt-6 w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
          >
            {status === "signing"
              ? "Sign in your wallet…"
              : status === "confirming"
                ? "Confirming on Solana…"
                : `Pay $${amount}`}
          </button>
        )}

        {error && <p className="mt-3 text-xs text-red-300">{error}</p>}

        <p className="mt-5 text-[10px] text-[#71717a]">
          Every payment commits a 4-hash on-chain receipt. The host page
          receives a verifiable signature back via postMessage.
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-[#71717a]">
        <span>
          Settle · {process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet"}
        </span>
        <button
          type="button"
          onClick={() => {
            closedRef.current = true;
            postToParent({ type: "settle:closed" });
          }}
          className="hover:text-[#27272a]"
        >
          Cancel
        </button>
      </div>
    </main>
  );
}
