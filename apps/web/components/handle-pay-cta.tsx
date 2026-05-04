"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { TrustGesture } from "@settle/ui";
import {
  fireSettlementConfetti,
  trustGesture,
  tierForAmountUsdc,
} from "../lib/confetti";
import { getSolscanUrl } from "../lib/solana";

/**
 * F8 — Handle-as-Venmo CTA. Reads ?req=X&note=Y from the URL and surfaces a one-tap pay
 * button on the profile page. The same URL pasted into X renders as a Phantom Blink via
 * the actions.json mapping (which targets /api/actions/router/{handle}/tip with the same
 * query params).
 *
 * Pay flow uses the Blink router endpoint to build the unsigned Solana Pay TransferChecked
 * tx (USDC, with embedded reference pubkey for tracking + memo program for the note).
 */
export function HandlePayCta({
  handle,
  recipientPubkey,
  displayName,
  requestedAmount,
  requestedNote,
}: {
  handle: string;
  recipientPubkey: string;
  displayName: string;
  requestedAmount: string | null;
  requestedNote: string | null;
}) {
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [paying, setPaying] = useState(false);
  const [gesture, setGesture] = useState<
    "idle" | "signing" | "confirming" | "success" | "error"
  >("idle");

  // Only show the inline CTA when an explicit amount is in the URL — otherwise the
  // standard tip flow on the profile page is the right surface.
  if (!requestedAmount) return null;
  const amount = parseFloat(requestedAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  void recipientPubkey; // pubkey is resolved server-side via the router

  async function handlePay() {
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect a wallet to send.");
      return;
    }
    trustGesture(amount);
    setPaying(true);
    setGesture("signing");
    try {
      const noteParam = requestedNote ? `&note=${encodeURIComponent(requestedNote)}` : "";
      const buildRes = await fetch(
        `/api/actions/router/${encodeURIComponent(handle)}/pay?amount=${encodeURIComponent(String(amount))}${noteParam}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account: publicKey.toBase58() }),
        },
      );
      const built = (await buildRes.json()) as {
        transaction?: string;
        message?: string;
        error?: string;
      };
      if (!built.transaction) {
        throw new Error(built.error ?? "build_failed");
      }

      const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
      const signed = await signTransaction(tx);
      setGesture("confirming");

      const sig = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: tx.recentBlockhash!,
          lastValidBlockHeight: tx.lastValidBlockHeight!,
        },
        "confirmed",
      );

      setGesture("success");
      fireSettlementConfetti(amount);
      toast.success(`Sent $${amount.toFixed(2)} to ${displayName}.`, {
        action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(sig), "_blank") },
      });
    } catch (e) {
      setGesture("error");
      toast.error(`Send failed: ${(e as Error).message}`);
    } finally {
      setPaying(false);
      setTimeout(() => setGesture("idle"), 2400);
    }
  }

  const tier = tierForAmountUsdc(amount);
  const accent =
    tier === "takeover"
      ? "from-amber-400/20 via-accent/20 to-emerald-400/20"
      : tier === "mid"
        ? "from-accent/15 to-transparent"
        : "from-accent/10 to-transparent";

  return (
    <div className={`mt-5 rounded-2xl border border-accent/30 bg-gradient-to-br ${accent} p-5`}>
      <div className="flex items-baseline justify-between">
        <div className="text-xs uppercase tracking-wider text-[#52525b]">
          {requestedNote ? "Pay request" : "Pay"}
        </div>
        <span className="text-[10px] text-[#71717a]">to {displayName}</span>
      </div>
      <div className="mt-2 text-4xl font-semibold tracking-tight">${amount.toFixed(2)}</div>
      {requestedNote && (
        <p className="mt-2 line-clamp-2 text-sm text-[#27272a]">&ldquo;{requestedNote}&rdquo;</p>
      )}
      <button
        type="button"
        onClick={() => void handlePay()}
        disabled={!connected || paying}
        className="mt-4 w-full w6-btn w6-btn-primary disabled:opacity-50"
      >
        {!connected
          ? "Connect a wallet to pay"
          : paying
            ? gesture === "signing"
              ? "Signing…"
              : gesture === "confirming"
                ? "Confirming on Solana…"
                : "Sending…"
            : `Send $${amount.toFixed(2)}`}
      </button>
      <p className="mt-2 text-[11px] text-[#71717a]">
        USDC · Solana Pay reference embedded · settles in &lt;1s
      </p>
      <TrustGesture state={gesture} />
    </div>
  );
}
