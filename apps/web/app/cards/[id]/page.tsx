"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { CnftReceipt, PactCard, ReceiptCard, TrustGesture } from "@settle/ui";
import { fireSettlementConfetti, fireReceiptBurst, trustGesture } from "../../../lib/confetti";
import { getSolscanUrl } from "../../../lib/solana";
import { lamportsToUsdc } from "../../../lib/format";
import { supabaseBrowser } from "../../../lib/supabase";

interface Receipt {
  request_id: string;
  card_pubkey: string;
  pact_pubkey: string | null;
  merchant_pubkey: string;
  amount_lamports: string;
  decision: "ALLOW" | "DENY" | "REVIEW";
  deny_code: number | null;
  capability_hash: string;
  purpose_text_hash: string;
  purpose_hash: string;
  receipt_hash: string;
  reason_hash: string;
  policy_snapshot_hash: string;
  sig_solscan: string | null;
  decision_slot: number;
  policy_version: number;
  target_method: string;
  target_path: string;
  created_at: string;
}

export default function CardDetailPage() {
  const params = useParams<{ id: string }>();
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(true);
  const [receiptsError, setReceiptsError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [revokeSig, setRevokeSig] = useState<string | null>(null);
  const [verifyingIdx, setVerifyingIdx] = useState<number | null>(null);
  const [verifiedIdx, setVerifiedIdx] = useState<Set<number>>(new Set());
  const [gesture, setGesture] = useState<
    "idle" | "signing" | "confirming" | "success" | "error"
  >("idle");

  // Receipt search/filter state
  const [filterDecision, setFilterDecision] = useState<"all" | "ALLOW" | "DENY" | "REVIEW">("all");
  const [filterMerchant, setFilterMerchant] = useState("");
  const [filterDays, setFilterDays] = useState<"all" | "1" | "7" | "30">("all");

  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    setReceiptsLoading(true);

    async function loadAndSubscribe() {
      try {
        const r = await fetch(`/api/cards/${params.id}/receipts?limit=20`);
        const data = await r.json();
        if (cancelled) return;
        if (r.ok) {
          setReceipts(data.receipts ?? []);
          setReceiptsError(null);
        } else {
          setReceiptsError(data.error ?? "fetch_failed");
        }
      } catch (e) {
        if (!cancelled) setReceiptsError(String((e as Error).message ?? e));
      } finally {
        if (!cancelled) setReceiptsLoading(false);
      }

      // Live updates — INSERTs to receipts table for this card or pact
      try {
        const supabase = supabaseBrowser();
        channel = supabase
          .channel(`receipts:${params.id}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "receipts",
              filter: `card_pubkey=eq.${params.id}`,
            },
            (payload) => {
              setReceipts((prev) => [payload.new as Receipt, ...prev]);
            },
          )
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "receipts",
              filter: `pact_pubkey=eq.${params.id}`,
            },
            (payload) => {
              setReceipts((prev) => [payload.new as Receipt, ...prev]);
            },
          )
          .subscribe();
      } catch {
        // Supabase not configured — error state already shown
      }
    }

    void loadAndSubscribe();

    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, [params.id]);

  async function handleRevoke(kind: "card" | "pact" = "pact") {
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect Phantom to revoke.");
      return;
    }

    trustGesture();
    setGesture("signing");

    try {
      const buildRes = await fetch(`/api/cards/${params.id}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authority: publicKey.toBase58(),
          kind,
        }),
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
      setRevoked(true);
      setRevokeSig(sig);
      fireSettlementConfetti();
      downloadProof(sig);
      toast.success(
        kind === "card" ? "Card revoked atomically." : "Pact closed. Refund queued.",
        {
          action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(sig), "_blank") },
        },
      );
    } catch (e) {
      setGesture("error");
      toast.error(`Revoke failed: ${(e as Error).message}`);
    } finally {
      setTimeout(() => setGesture("idle"), 2400);
    }
  }

  function downloadProof(sig: string) {
    const proof = {
      version: 1,
      card_or_pact: params.id,
      revoke_signature: sig,
      solscan_url: getSolscanUrl(sig),
      revoked_at_iso: new Date().toISOString(),
      authority: publicKey?.toBase58(),
    };
    const blob = new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revocation-proof-${params.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleVerify(idx: number) {
    const r = receipts[idx];
    if (!r) return;
    setVerifyingIdx(idx);
    try {
      const res = await fetch(`/api/receipts/${r.request_id}/verify`);
      const data = await res.json();
      if (data.ok) {
        setVerifiedIdx((prev) => new Set([...prev, idx]));
        fireReceiptBurst();
        toast.success(
          `verifyReceipt() ✓ ${data.verified?.length ?? 0} hashes match on-chain`,
          {
            description: data.note ?? `Receipt ${r.request_id.slice(0, 8)}…`,
          },
        );
      } else {
        toast.error(`verifyReceipt() ✗ mismatches: ${(data.mismatches ?? []).join(", ")}`, {
          description: `Receipt ${r.request_id.slice(0, 8)}… may be tampered`,
        });
      }
    } catch (e) {
      toast.error(`verify failed: ${(e as Error).message}`);
    } finally {
      setVerifyingIdx(null);
    }
  }

  const allowReceipts = receipts.filter((r) => r.decision === "ALLOW");

  // Apply UI filters (decision, merchant prefix match, recency)
  const filteredReceipts = receipts.filter((r) => {
    if (filterDecision !== "all" && r.decision !== filterDecision) return false;
    if (filterMerchant.trim()) {
      const q = filterMerchant.trim().toLowerCase();
      if (
        !r.merchant_pubkey.toLowerCase().includes(q) &&
        !r.target_path.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (filterDays !== "all") {
      const cutoff = Date.now() - Number(filterDays) * 86_400_000;
      if (new Date(r.created_at).getTime() < cutoff) return false;
    }
    return true;
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-6 text-xs text-foreground/40">
        Card · <span className="font-mono">{params.id.slice(0, 8)}…{params.id.slice(-6)}</span>
        {revokeSig && (
          <a
            className="ml-3 text-accent hover:underline"
            href={getSolscanUrl(revokeSig)}
            target="_blank"
            rel="noreferrer"
          >
            Solscan ↗
          </a>
        )}
      </div>

      <PactCard
        label="Pact"
        capUsdc="—"
        usedUsdc={
          allowReceipts.length === 0
            ? "$0.00"
            : `$${(
                allowReceipts.reduce((s, r) => s + Number(r.amount_lamports), 0) / 1_000_000
              ).toFixed(2)}`
        }
        fillPct={revoked ? 0 : 0.6}
        allowlist={[...new Set(allowReceipts.map((r) => r.merchant_pubkey.slice(0, 6)))]}
        expiryLabel={revoked ? "—" : "—"}
        revoked={revoked}
        {...(!revoked ? { onRevoke: () => void handleRevoke("pact") } : {})}
      />

      <div className="mt-12 flex items-end justify-between gap-4">
        <h2 className="text-lg font-medium">Receipts</h2>
        <span className="text-xs text-foreground/40">
          {filteredReceipts.length} of {receipts.length}
        </span>
      </div>

      {receipts.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={filterMerchant}
            onChange={(e) => setFilterMerchant(e.target.value)}
            placeholder="Search merchant or path…"
            className="flex-1 min-w-[200px] rounded-full border border-foreground/15 bg-transparent px-4 py-2 text-xs outline-none focus:border-accent"
          />
          <div className="flex gap-1 rounded-full border border-foreground/15 bg-white/[0.02] p-1 text-xs">
            {(["all", "ALLOW", "DENY", "REVIEW"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilterDecision(k)}
                className={
                  filterDecision === k
                    ? "rounded-full bg-accent px-3 py-1 text-background"
                    : "rounded-full px-3 py-1 text-foreground/60 hover:text-foreground"
                }
              >
                {k.toLowerCase()}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-full border border-foreground/15 bg-white/[0.02] p-1 text-xs">
            {(["all", "1", "7", "30"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilterDays(k)}
                className={
                  filterDays === k
                    ? "rounded-full bg-accent px-3 py-1 text-background"
                    : "rounded-full px-3 py-1 text-foreground/60 hover:text-foreground"
                }
              >
                {k === "all" ? "all" : `${k}d`}
              </button>
            ))}
          </div>
        </div>
      )}

      {receiptsLoading ? (
        <div className="mt-4 grid gap-3">
          <div className="h-20 animate-pulse rounded-2xl border border-foreground/10 bg-white/[0.02]" />
          <div className="h-20 animate-pulse rounded-2xl border border-foreground/10 bg-white/[0.02]" />
        </div>
      ) : receiptsError === "supabase_unconfigured" ? (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-300">
          Supabase not configured. Set <code>SUPABASE_URL</code> +{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>, apply migrations, run{" "}
          <code>pnpm seed:supabase</code>.
        </div>
      ) : receipts.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6 text-sm text-foreground/60">
          No receipts yet. The agent hasn&apos;t spent anything on this card.
        </div>
      ) : filteredReceipts.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6 text-sm text-foreground/50">
          No receipts match these filters.{" "}
          <button
            className="text-accent hover:underline"
            onClick={() => {
              setFilterDecision("all");
              setFilterMerchant("");
              setFilterDays("all");
            }}
          >
            Clear
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {filteredReceipts.map((r) => {
            const idx = receipts.indexOf(r);
            return (
              <ReceiptCard
                key={r.request_id}
                merchant={`${r.merchant_pubkey.slice(0, 6)}…${r.merchant_pubkey.slice(-4)}`}
                amountUsdc={`$${lamportsToUsdc(r.amount_lamports)}`}
                note={`${r.target_method} ${r.target_path}`}
                decision={r.decision}
                {...(r.deny_code !== null && r.deny_code !== undefined ? { denyCode: r.deny_code } : {})}
                {...(r.sig_solscan ? { solscanHref: getSolscanUrl(r.sig_solscan) } : {})}
                verified={verifiedIdx.has(idx)}
                onVerify={() => void handleVerify(idx)}
              />
            );
          })}
        </div>
      )}

      {revoked && allowReceipts.length > 0 && (
        <>
          <h2 className="mt-12 text-lg font-medium">cNFT receipts minted</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {allowReceipts.slice(0, 3).map((r, i) => (
              <CnftReceipt
                key={r.request_id}
                index={i + 1}
                merchant={`${r.merchant_pubkey.slice(0, 6)}…`}
                amountUsdc={`$${lamportsToUsdc(r.amount_lamports)}`}
                cnftAddress={r.receipt_hash.slice(0, 44)}
              />
            ))}
          </div>
        </>
      )}

      <TrustGesture
        state={gesture}
        {...(gesture === "signing"
          ? { message: "Signing revoke in Phantom…" }
          : gesture === "confirming"
            ? { message: "Confirming on Solana…" }
            : gesture === "success"
              ? { message: "Revoked. Proof downloaded." }
              : gesture === "error"
                ? { message: "Failed — try again" }
                : {})}
      />

      {verifyingIdx !== null && <TrustGesture state="confirming" message="verifyReceipt()…" />}
    </main>
  );
}
