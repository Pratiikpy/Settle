"use client";

import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { fireSettlementConfetti, trustGesture } from "../lib/confetti";
import { getSolscanUrl } from "../lib/solana";

/**
 * F22 — DeliveryEscrow state surface.
 *
 * Drop-in component for /receipts/[requestId] or /cards/[id]. Given a pact pubkey,
 * polls the escrow state via /api/escrows/[id]/dispute (GET would be nicer; reusing
 * the existing endpoints suffices for the MVP) and renders the right action button:
 *
 *   buyer + open + within dispute window  →  "Confirm receipt" + "Dispute"
 *   buyer + open + past dispute window     →  "Confirm receipt" only (no refund possible)
 *   not-buyer + open + past confirm dl     →  "Release to merchant" (permissionless)
 *   released                                →  "Released to merchant ✓"
 *   refunded                                →  "Refunded to buyer ✓"
 *
 * The component reads the live state from /api/escrows/[id] (we add a GET on it for
 * UI hydration). For now, it accepts the state via props from the parent page that
 * already has the pact data.
 */

export interface EscrowProps {
  pactPubkey: string;
  amountLamports: string;
  merchantPubkey: string;
  buyerPubkey: string;
  confirmDeadlineSlot: string;
  disputeDeadlineSlot: string;
  released: boolean;
  refunded: boolean;
}

function lamportsToUsd(v: string): string {
  const n = BigInt(v);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return `$${whole}.${frac.toString().padStart(6, "0").slice(0, 2)}`;
}

export function EscrowState(props: EscrowProps) {
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [currentSlot, setCurrentSlot] = useState<bigint | null>(null);
  const [busy, setBusy] = useState<"none" | "release" | "dispute">("none");
  const [released, setReleased] = useState(props.released);
  const [refunded, setRefunded] = useState(props.refunded);

  useEffect(() => {
    let cancelled = false;
    void connection.getSlot("confirmed").then((s) => {
      if (!cancelled) setCurrentSlot(BigInt(s));
    });
    const id = window.setInterval(async () => {
      try {
        const s = await connection.getSlot("confirmed");
        if (!cancelled) setCurrentSlot(BigInt(s));
      } catch {
        // ignore
      }
    }, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [connection]);

  async function callAction(action: "release" | "dispute") {
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect a wallet.");
      return;
    }
    setBusy(action);
    trustGesture();
    try {
      const body =
        action === "release"
          ? { caller: publicKey.toBase58() }
          : { authority: publicKey.toBase58() };
      const r = await fetch(
        `/api/escrows/${props.pactPubkey}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const d = await r.json();
      if (!d.ok) throw new Error(d.message ?? d.error ?? `${action}_failed`);
      const tx = Transaction.from(Buffer.from(d.transaction, "base64"));
      const signed = await signTransaction(tx);
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
      if (action === "release") {
        setReleased(true);
        fireSettlementConfetti();
        toast.success("Released to merchant.", {
          action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(sig), "_blank") },
        });
      } else {
        setRefunded(true);
        toast.success("Refunded to your wallet.", {
          action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(sig), "_blank") },
        });
      }
    } catch (e) {
      toast.error(`${action} failed: ${(e as Error).message}`);
    } finally {
      setBusy("none");
    }
  }

  // Terminal states
  if (released) {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-sm">
        <div className="text-xs uppercase tracking-wider text-emerald-400">Released</div>
        <div className="mt-1">
          {lamportsToUsd(props.amountLamports)} delivered to merchant.
        </div>
      </div>
    );
  }
  if (refunded) {
    return (
      <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5 text-sm">
        <div className="text-xs uppercase tracking-wider text-[#71717a]">Refunded</div>
        <div className="mt-1">
          {lamportsToUsd(props.amountLamports)} refunded to buyer (dispute resolved).
        </div>
      </div>
    );
  }

  const isBuyer = publicKey?.toBase58() === props.buyerPubkey;
  const confirmDeadline = BigInt(props.confirmDeadlineSlot);
  const disputeDeadline = BigInt(props.disputeDeadlineSlot);
  const past_confirm = currentSlot != null && currentSlot >= confirmDeadline;
  const past_dispute = currentSlot != null && currentSlot >= disputeDeadline;
  const slotsToConfirm =
    currentSlot == null ? null : confirmDeadline > currentSlot ? confirmDeadline - currentSlot : 0n;
  const slotsToDispute =
    currentSlot == null ? null : disputeDeadline > currentSlot ? disputeDeadline - currentSlot : 0n;

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
      <div className="text-xs uppercase tracking-wider text-amber-400">In escrow</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">
        {lamportsToUsd(props.amountLamports)}
      </div>
      <p className="mt-2 text-xs text-[#52525b]">
        Held in the Pact Vault PDA. Funds release only when buyer confirms or the
        deadline passes — and only to the merchant pinned at open.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
        <div>
          <div className="text-[#71717a]">Confirm deadline</div>
          <div className="font-mono">
            {past_confirm ? "passed" : `+${slotsToConfirm} slots`}
          </div>
        </div>
        <div>
          <div className="text-[#71717a]">Dispute deadline</div>
          <div className="font-mono">
            {past_dispute ? "closed" : `+${slotsToDispute} slots`}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {isBuyer ? (
          <>
            <button
              type="button"
              onClick={() => void callAction("release")}
              disabled={busy !== "none"}
              className="w-full rounded-full bg-emerald-500 py-3 text-sm font-medium text-background disabled:opacity-50 hover:bg-emerald-400"
            >
              {busy === "release" ? "Confirming…" : "I received it — release to merchant"}
            </button>
            {!past_dispute && (
              <button
                type="button"
                onClick={() => void callAction("dispute")}
                disabled={busy !== "none"}
                className="w-full rounded-full border border-[#a1a1aa] py-3 text-sm font-medium hover:bg-[#f4f4f5] disabled:opacity-50"
              >
                {busy === "dispute" ? "Disputing…" : "Dispute (refund)"}
              </button>
            )}
          </>
        ) : past_confirm ? (
          <button
            type="button"
            onClick={() => void callAction("release")}
            disabled={busy !== "none"}
            className="w-full w6-btn w6-btn-primary disabled:opacity-50"
          >
            {busy === "release" ? "Releasing…" : "Permissionless release"}
          </button>
        ) : (
          <div className="text-center text-xs text-[#71717a]">
            Only the buyer can confirm or dispute until the confirm deadline passes.
          </div>
        )}
      </div>
    </div>
  );
}
