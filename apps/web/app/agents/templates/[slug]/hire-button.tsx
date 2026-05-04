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

  async function handleHire() {
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect a wallet to hire.");
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
        const err = await buildRes.json();
        throw new Error(err.error ?? "build_failed");
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
          lastValidBlockHeight: tx.lastValidBlockHeight!,
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
      toast.error(`Failed: ${(e as Error).message}`);
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
      <TrustGesture state={gesture} />
    </>
  );
}
