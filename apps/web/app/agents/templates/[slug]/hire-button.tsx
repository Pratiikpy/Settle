"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { TrustGesture } from "@settle/ui";
import { fireSettlementConfetti, trustGesture } from "../../../../lib/confetti";
import { getSolscanUrl } from "../../../../lib/solana";

export function TemplateHireButton({ slug }: { slug: string }) {
  const router = useRouter();
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [gesture, setGesture] = useState<
    "idle" | "signing" | "confirming" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleHire() {
    setErrorMsg(null);
    if (!connected || !publicKey || !signTransaction) {
      const m = "Connect a wallet to hire.";
      toast.error(m);
      setErrorMsg(m);
      return;
    }

    trustGesture();
    setGesture("signing");

    try {
      const buildRes = await fetch(`/api/actions/hire/${slug}/spawn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account: publicKey.toBase58() }),
      });
      if (!buildRes.ok) {
        let err: { error?: string; message?: string } = {};
        try {
          err = await buildRes.json();
        } catch {
          /* non-JSON body — keep generic message */
        }
        // Surface the friendlier message (which the API includes for known
        // failure modes like missing merchant allowlist config), falling
        // back to the error code, then a generic.
        throw new Error(err.message ?? err.error ?? `build_failed_${buildRes.status}`);
      }
      const { transaction } = (await buildRes.json()) as { transaction: string };

      const tx = Transaction.from(Buffer.from(transaction, "base64"));
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

      setGesture("success");
      fireSettlementConfetti();
      toast.success("Spending rule active.", {
        action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(sig), "_blank") },
      });
      setTimeout(() => router.push("/cards"), 1200);
    } catch (e) {
      setGesture("error");
      const msg = (e as Error).message;
      toast.error(`Failed: ${msg}`);
      setErrorMsg(msg);
    } finally {
      setTimeout(() => setGesture("idle"), 2400);
    }
  }

  return (
    <>
      <button
        onClick={() => void handleHire()}
        disabled={!connected || gesture !== "idle"}
        className="w-full w6-btn w6-btn-primary disabled:opacity-50"
      >
        {!connected
          ? "Connect a wallet to hire"
          : gesture === "signing"
            ? "Signing mandate…"
            : gesture === "confirming"
              ? "Opening spending rule…"
              : gesture === "success"
                ? "Spending rule open ✓"
                : "Hire — sign rule"}
      </button>
      {errorMsg ? (
        <div
          role="alert"
          style={{
            marginTop: 12,
            padding: "10px 12px",
            border: "1px solid var(--w6-rule, #e5e7eb)",
            borderRadius: 6,
            background: "color-mix(in srgb, var(--w6-danger, #dc2626) 6%, transparent)",
            color: "var(--w6-danger, #dc2626)",
            fontSize: 12.5,
            lineHeight: 1.5,
          }}
        >
          {errorMsg}
        </div>
      ) : null}
      <TrustGesture state={gesture} />
    </>
  );
}
