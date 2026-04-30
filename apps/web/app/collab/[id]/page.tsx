"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { fireSettlementConfetti, trustGesture } from "../../../lib/confetti";
import { getSolscanUrl } from "../../../lib/solana";
import { Footer } from "../../../components/footer";

interface Collab {
  id: string;
  organizer_pubkey: string;
  creator_a_pubkey: string;
  creator_b_pubkey: string;
  ratio_bps_a: number;
  label: string;
  description: string | null;
  active: boolean;
}

/**
 * F20 — Buyer-facing collab payment page. Reads the collab spec from the API, lets the
 * buyer pick an amount, builds a 2-TransferChecked tx server-side, signs in wallet,
 * submits. Both creators get paid atomically — single tx, all-or-nothing.
 */
export default function CollabPayPage() {
  const params = useParams<{ id: string }>();
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [collab, setCollab] = useState<Collab | null>(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);

  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    void fetch(`/api/collabs/${params.id}`)
      .then(async (r) => {
        const d = await r.json();
        if (cancelled) return;
        if (r.ok) setCollab(d.collab);
        else setError(d.error ?? "fetch_failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function pay() {
    if (!collab || !connected || !publicKey || !signTransaction) return;
    const decimal = parseFloat(amount);
    if (!Number.isFinite(decimal) || decimal <= 0) {
      toast.error("Enter an amount.");
      return;
    }
    const lamports = BigInt(Math.round(decimal * 1_000_000));
    setBusy(true);
    trustGesture(decimal);
    try {
      const r = await fetch(`/api/collabs/${collab.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: publicKey.toBase58(), amount_lamports: lamports.toString() }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.message ?? d.error ?? "build_failed");
      const tx = Transaction.from(Buffer.from(d.transaction, "base64"));
      const signed = await signTransaction(tx);
      const txSig = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature: txSig,
          blockhash: tx.recentBlockhash!,
          lastValidBlockHeight: tx.lastValidBlockHeight!,
        },
        "confirmed",
      );
      setSig(txSig);
      fireSettlementConfetti(decimal);
      toast.success(`Paid $${amount} — split atomically across both creators.`);
    } catch (e) {
      toast.error(`Pay failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center text-sm text-foreground/60">
        Loading collab…
      </main>
    );
  }
  if (error || !collab) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">Collab unavailable</h1>
        <p className="mt-3 text-sm text-foreground/60">{error ?? "not_found"}</p>
      </main>
    );
  }

  const ratioAPct = collab.ratio_bps_a / 100;
  const ratioBPct = (10_000 - collab.ratio_bps_a) / 100;

  return (
    <>
      <main className="mx-auto max-w-md px-6 py-12">
        <div className="rounded-2xl border border-foreground/10 bg-white/[0.02] p-6">
          <div className="text-xs uppercase tracking-wider text-foreground/45">Collab</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{collab.label}</h1>
          {collab.description && (
            <p className="mt-2 text-sm text-foreground/60">{collab.description}</p>
          )}
          <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-foreground/10 p-3">
              <div className="text-foreground/40">Creator A · {ratioAPct}%</div>
              <div className="mt-1 truncate font-mono text-[11px]">
                {collab.creator_a_pubkey.slice(0, 6)}…{collab.creator_a_pubkey.slice(-4)}
              </div>
            </div>
            <div className="rounded-xl border border-foreground/10 p-3">
              <div className="text-foreground/40">Creator B · {ratioBPct}%</div>
              <div className="mt-1 truncate font-mono text-[11px]">
                {collab.creator_b_pubkey.slice(0, 6)}…{collab.creator_b_pubkey.slice(-4)}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <label className="block text-xs font-medium text-foreground/60">Amount (USDC)</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10.00"
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
            />
          </div>
          <button
            onClick={() => void pay()}
            disabled={!connected || busy}
            className="mt-4 w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
          >
            {!connected ? "Connect Phantom to pay" : busy ? "Paying…" : "Pay both atomically"}
          </button>
          <p className="mt-2 text-[10px] text-foreground/40">
            One Solana tx, two TransferChecked ixs. All-or-nothing.
          </p>
        </div>
        {sig && (
          <a
            href={getSolscanUrl(sig)}
            target="_blank"
            rel="noreferrer"
            className="mt-6 block text-center text-xs text-accent hover:underline"
          >
            View tx on Solscan ↗
          </a>
        )}
      </main>
      <Footer />
    </>
  );
}
