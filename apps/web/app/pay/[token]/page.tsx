"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { TrustGesture } from "@settle/ui";
import { fireSettlementConfetti, trustGesture } from "../../../lib/confetti";
import { getSolscanUrl } from "../../../lib/solana";

interface LinkPreview {
  title: string;
  description: string | null;
  amount_usdc: number;
  claimed: boolean;
  expired: boolean;
  creator_pubkey: string;
}

/**
 * F10 — Buyer-side claim page for one-time-use payment links.
 *
 * Same /pay/[token] URL doubles as a Phantom Blink (per actions.json mapping). When opened
 * in a browser, this page is the rich landing experience: shows what's being purchased,
 * who's the creator, and a one-tap connect-and-pay button.
 */
export default function PayLinkPage() {
  const params = useParams<{ token: string }>();
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [paidSig, setPaidSig] = useState<string | null>(null);
  const [gesture, setGesture] = useState<
    "idle" | "signing" | "confirming" | "success" | "error"
  >("idle");

  useEffect(() => {
    if (!params.token) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/payment-links/${params.token}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError((json as { error?: string }).error ?? "fetch_failed");
          return;
        }
        setPreview(json as LinkPreview);
      } catch (e) {
        if (!cancelled) setError(String((e as Error).message ?? e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.token]);

  async function handlePay() {
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect a wallet to pay.");
      return;
    }
    if (!preview) return;

    trustGesture(preview.amount_usdc);
    setPaying(true);
    setGesture("signing");
    try {
      const buildRes = await fetch(`/api/payment-links/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: publicKey.toBase58() }),
      });
      const built = (await buildRes.json()) as {
        transaction?: string;
        message?: string;
        error?: string;
      };
      if (!built.transaction) {
        if ("error" in built && built.error === "already_claimed") {
          toast.error("This link was already claimed.");
          setError("already_claimed");
        } else if ("error" in built && built.error === "expired") {
          toast.error("This link has expired.");
          setError("expired");
        } else {
          toast.error(built.error ?? "build_failed");
        }
        setGesture("error");
        return;
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
          lastValidBlockHeight: tx.lastValidBlockHeight ?? (await connection.getBlockHeight()) + 150,
        },
        "confirmed",
      );

      setPaidSig(sig);
      setGesture("success");
      fireSettlementConfetti(preview.amount_usdc);
      toast.success(`Paid $${preview.amount_usdc.toFixed(2)}.`, {
        action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(sig), "_blank") },
      });
    } catch (e) {
      setGesture("error");
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setPaying(false);
      setTimeout(() => setGesture("idle"), 2400);
    }
  }

  if (error === "not_found") {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-2xl font-semibold">Link not found</h1>
        <p className="mt-3 text-sm text-[#52525b]">
          This payment link doesn&apos;t exist.
        </p>
      </main>
    );
  }
  if (!preview) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <div className="h-32 animate-pulse rounded-2xl border border-[#e4e4e7] bg-[#fafafa]" />
      </main>
    );
  }

  if (paidSig) {
    return (
      <>
        <main className="mx-auto max-w-md px-6 py-16 text-center">
          <div className="text-6xl">✓</div>
          <h1 className="mt-4 text-2xl font-semibold">Paid ${preview.amount_usdc.toFixed(2)}</h1>
          <p className="mt-3 text-sm text-[#52525b]">Your receipt is on-chain.</p>
          <a
            href={getSolscanUrl(paidSig)}
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full border border-[#a1a1aa] px-6 text-xs hover:bg-[#f4f4f5]"
          >
            View on Solscan ↗
          </a>
        </main>
      </>
    );
  }

  return (
    <>
      <main className="mx-auto max-w-md px-6 py-12">
        <div className="rounded-3xl border border-[#e4e4e7] card-surface p-8">
          <div className="text-xs uppercase tracking-wider text-[#71717a]">
            Pay-once link
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{preview.title}</h1>
          {preview.description && (
            <p className="mt-3 text-sm text-[#09090b]/65">{preview.description}</p>
          )}
          <div className="mt-6 text-5xl font-semibold tracking-tight">
            ${preview.amount_usdc.toFixed(2)}
          </div>
          <div className="mt-2 text-[11px] text-[#71717a]">
            to <code>{preview.creator_pubkey.slice(0, 8)}…{preview.creator_pubkey.slice(-4)}</code>
          </div>

          {preview.claimed && (
            <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              This link was already claimed. Single-use.
            </div>
          )}
          {preview.expired && (
            <div className="mt-6 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-300">
              This link has expired.
            </div>
          )}

          {!preview.claimed && !preview.expired && (
            <button
              type="button"
              onClick={() => void handlePay()}
              disabled={!connected || paying}
              className="mt-6 w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
            >
              {!connected
                ? "Connect a wallet to pay"
                : paying
                  ? gesture === "signing"
                    ? "Signing…"
                    : gesture === "confirming"
                      ? "Confirming on Solana…"
                      : "Paying…"
                  : `Pay $${preview.amount_usdc.toFixed(2)}`}
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-[#71717a]">
          One-time-use · USDC · settles in &lt;1s · receipt on-chain
        </p>

        <TrustGesture state={gesture} />
      </main>
    </>
  );
}
