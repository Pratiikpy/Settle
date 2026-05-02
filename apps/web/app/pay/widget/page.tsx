"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { TrustScoreBadge } from "@settle/ui";
import { fireSettlementConfetti } from "../../../lib/confetti";
import { getSolscanUrl } from "../../../lib/solana";

/**
 * F5.4 — Pay-widget popup flow.
 *
 * Opened by `<settle-pay>` custom element with query string:
 *   ?merchant=<pubkey>&amount=<usdc-decimal>&note=<text>&origin=<host>
 *
 * Flow:
 *   1. User connects Phantom (existing WalletMultiButton in header).
 *   2. Sees the requested amount + recipient + trust score.
 *   3. Clicks "Pay" → /api/send/build → signs → broadcasts → confirms.
 *   4. On success: postMessages success event to the opener window
 *      (using `origin` from the query string for targetOrigin), then
 *      auto-closes after 2s.
 *
 * On any failure: postMessages a settle:payment-error event so the host
 * page can react (e.g. show "payment failed" inline).
 */

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type PostStatus =
  | "loading"
  | "ready"
  | "signing"
  | "confirming"
  | "success"
  | "error";

interface PaySuccessMessage {
  type: "settle:payment-success";
  signature: string;
  request_id: string;
  amount_usdc: string;
  recipient: string;
}
interface PayErrorMessage {
  type: "settle:payment-error";
  message: string;
}
interface PayCancelMessage {
  type: "settle:payment-cancelled";
}

export default function PayWidgetPage() {
  const params = useSearchParams();
  const merchant = params.get("merchant") ?? "";
  const amount = params.get("amount") ?? "";
  const note = params.get("note") ?? "";
  const originParam = params.get("origin") ?? "*";
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [status, setStatus] = useState<PostStatus>("ready");
  const [error, setError] = useState<string | null>(null);
  const closedRef = useRef(false);

  // Validate query.
  const valid = useMemo(() => {
    if (!PUBKEY_RE.test(merchant)) return false;
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return false;
    return true;
  }, [merchant, amount]);

  function postToOpener(msg: PaySuccessMessage | PayErrorMessage | PayCancelMessage) {
    try {
      window.opener?.postMessage(msg, originParam || "*");
    } catch {
      // ignore — host page may have closed
    }
  }

  // Notify opener on unload if user cancelled without paying.
  useEffect(() => {
    function onUnload() {
      if (!closedRef.current && status !== "success") {
        postToOpener({ type: "settle:payment-cancelled" });
      }
    }
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [status]);

  async function handlePay() {
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect Phantom first.");
      return;
    }
    setStatus("signing");
    setError(null);
    try {
      // 1. Build the unsigned tx via /api/send/build (idempotency-keyed).
      const idempotencyKey = crypto.randomUUID();
      const buildRes = await fetch("/api/send/build", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          from: publicKey.toBase58(),
          to: merchant,
          amount,
          note: note || undefined,
        }),
      });
      const built = await buildRes.json();
      if (!built.ok || !built.transaction) {
        throw new Error(built.message ?? built.error ?? "build_failed");
      }

      // 2. Sign with Phantom.
      const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
      const signed = await signTransaction(tx);
      setStatus("confirming");

      // 3. Broadcast + confirm.
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: built.blockhash,
          lastValidBlockHeight: built.last_valid_block_height!,
        },
        "confirmed",
      );

      setStatus("success");
      fireSettlementConfetti();

      // 4. Notify opener + auto-close.
      postToOpener({
        type: "settle:payment-success",
        signature: sig,
        request_id: built.receipt?.request_id ?? "",
        amount_usdc: amount,
        recipient: merchant,
      });
      closedRef.current = true;
      setTimeout(() => window.close(), 2200);
    } catch (e) {
      const msg = (e as Error).message ?? "payment_failed";
      setStatus("error");
      setError(msg);
      postToOpener({ type: "settle:payment-error", message: msg });
    }
  }

  if (!valid) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">Invalid pay request</h1>
        <p className="mt-3 text-sm text-foreground/60">
          The pay popup was opened with bad parameters. Need:{" "}
          <code>merchant</code> (base58 pubkey) and <code>amount</code> (positive USDC decimal).
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="rounded-3xl border border-foreground/10 bg-white/[0.03] p-6">
        <div className="text-[10px] uppercase tracking-wide text-foreground/40">
          Pay with Settle
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight">${amount}</span>
          <span className="text-sm text-foreground/50">USDC</span>
        </div>

        <div className="mt-5 grid grid-cols-[80px,1fr] gap-y-3 text-xs">
          <span className="text-foreground/45">to</span>
          <div className="flex items-center gap-2">
            <code className="font-mono text-foreground/85">
              {merchant.slice(0, 8)}…{merchant.slice(-6)}
            </code>
            <TrustScoreBadge pubkey={merchant} variant="compact" />
          </div>
          {note && (
            <>
              <span className="text-foreground/45">note</span>
              <span className="text-foreground/85">{note}</span>
            </>
          )}
        </div>

        {!connected ? (
          <div className="mt-6 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-4 text-center text-xs text-foreground/60">
            Connect Phantom (top right) to continue.
          </div>
        ) : status === "success" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-400/[0.05] p-4 text-center text-xs text-emerald-300">
            Paid ✓ — closing in a moment.
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void handlePay()}
            disabled={status === "signing" || status === "confirming"}
            className="mt-6 w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
          >
            {status === "signing"
              ? "Sign in Phantom…"
              : status === "confirming"
                ? "Confirming on Solana…"
                : `Pay $${amount}`}
          </button>
        )}

        {error && (
          <p className="mt-3 text-xs text-red-300">
            {error}
          </p>
        )}

        <p className="mt-5 text-[10px] text-foreground/40">
          Every payment commits a 4-hash on-chain receipt. The host page
          receives a verifiable signature back via postMessage.
        </p>
      </div>

      <div className="mt-4 text-center text-[10px] text-foreground/40">
        Settle Protocol · {process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet"}
      </div>
    </main>
  );
}
