"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { fireSettlementConfetti, trustGesture } from "../../../lib/confetti";
import { getSolscanUrl } from "../../../lib/solana";
import { supabaseBrowser } from "../../../lib/supabase";
import { W6AppShell } from "../../../components/w6-app-shell";

interface Bill {
  id: string;
  organizer_pubkey: string;
  label: string;
  target_total_lamports: string;
  per_payer_lamports: string;
  n_payers: number;
  created_at: string;
  completed_at: string | null;
}

interface Payment {
  payer_pubkey: string;
  amount_lamports: string;
  sig_solscan: string | null;
  created_at: string;
}

function lamportsToUsd(v: string): string {
  const n = BigInt(v);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return `$${whole}.${frac.toString().padStart(6, "0").slice(0, 2)}`;
}

export default function SplitBillPage() {
  const params = useParams<{ id: string }>();
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [bill, setBill] = useState<Bill | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Hydrate + subscribe to realtime updates on the payments table.
  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    async function hydrate() {
      try {
        const r = await fetch(`/api/split-bills/${params.id}`);
        const d = await r.json();
        if (cancelled) return;
        if (r.ok) {
          setBill(d.bill);
          setPayments(d.payments ?? []);
        }
      } catch {
        /* network error — leave loading false so UI doesn't spin forever */
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void hydrate();
    try {
      channel = supabaseBrowser()
        .channel(`split-bill:${params.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "split_bill_payments",
            filter: `bill_id=eq.${params.id}`,
          },
          (payload) => {
            const p = payload.new as Payment;
            setPayments((prev) =>
              prev.some((x) => x.payer_pubkey === p.payer_pubkey) ? prev : [...prev, p],
            );
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "split_bills",
            filter: `id=eq.${params.id}`,
          },
          (payload) => {
            setBill((prev) =>
              prev ? { ...prev, completed_at: (payload.new as Bill).completed_at } : prev,
            );
          },
        )
        .subscribe();
    } catch {
      // Realtime offline — page still renders with hydrated state.
    }

    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, [params.id]);

  const alreadyPaid =
    publicKey != null &&
    payments.some((p) => p.payer_pubkey === publicKey.toBase58());

  async function pay() {
    if (!bill || !connected || !publicKey || !signTransaction) return;
    setBusy(true);
    trustGesture();
    try {
      const buildRes = await fetch(`/api/split-bills/${bill.id}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: publicKey.toBase58() }),
      });
      const built = await buildRes.json();
      if (!built.ok) throw new Error(built.message ?? built.error ?? "build_failed");
      const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
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

      // Record on the server. Best-effort; if this fails the on-chain payment is still valid
      // and the realtime indexer will pick it up via memo.
      await fetch(`/api/split-bills/${bill.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payer: publicKey.toBase58(), sig }),
      });

      fireSettlementConfetti();
      toast.success("Paid your share.", {
        action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(sig), "_blank") },
      });
    } catch (e) {
      toast.error(`Pay failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-md px-6 py-16 text-center text-sm">Loading…</main>;
  }
  if (!bill) {
    return (
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">Bill not found</h1>
      </main>
    );
  }

  const paidPct = (payments.length / bill.n_payers) * 100;
  const totalPaidLamports = payments.reduce((s, p) => s + BigInt(p.amount_lamports), 0n);

  return (
    <W6AppShell forceSurface="consumer">
      <div style={{ maxWidth: 880 }}>
        <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-6">
          <div className="text-xs uppercase tracking-wider text-[#71717a]">Split bill</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{bill.label}</h1>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-[#71717a]">Target</div>
              <div className="mt-1 text-base font-medium">
                {lamportsToUsd(bill.target_total_lamports)}
              </div>
            </div>
            <div>
              <div className="text-[#71717a]">Your share</div>
              <div className="mt-1 text-base font-medium">
                {lamportsToUsd(bill.per_payer_lamports)}
              </div>
            </div>
            <div>
              <div className="text-[#71717a]">Paid</div>
              <div className="mt-1 text-base font-medium">
                {payments.length} / {bill.n_payers}
              </div>
            </div>
            <div>
              <div className="text-[#71717a]">Status</div>
              <div
                className={`mt-1 text-base font-medium ${
                  bill.completed_at ? "text-emerald-400" : "text-[#27272a]"
                }`}
              >
                {bill.completed_at ? "Settled" : "Open"}
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="h-2 overflow-hidden rounded-full bg-[#e4e4e7]">
              <div
                className="h-full bg-accent"
                style={{ width: `${Math.min(paidPct, 100)}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-[#71717a]">
              {lamportsToUsd(totalPaidLamports.toString())} collected so far
            </div>
          </div>

          {bill.completed_at ? (
            <div className="mt-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-300">
              Bill closed. Thanks!
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void pay()}
              disabled={!connected || busy || alreadyPaid}
              className="mt-5 w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
            >
              {!connected
                ? "Connect a wallet to pay"
                : alreadyPaid
                  ? "You've already paid ✓"
                  : busy
                    ? "Paying…"
                    : `Pay ${lamportsToUsd(bill.per_payer_lamports)}`}
            </button>
          )}
        </div>

        {payments.length > 0 && (
          <section className="mt-6 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
            <h2 className="text-sm font-medium">Payers</h2>
            <ul className="mt-3 space-y-2 text-xs">
              {payments.map((p) => (
                <li
                  key={p.payer_pubkey}
                  className="flex items-center justify-between"
                >
                  <span className="font-mono text-[#27272a]">
                    {p.payer_pubkey.slice(0, 6)}…{p.payer_pubkey.slice(-4)}
                  </span>
                  {p.sig_solscan && (
                    <a
                      href={getSolscanUrl(p.sig_solscan)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[#71717a] hover:text-accent"
                    >
                      ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </W6AppShell>
  );
}
