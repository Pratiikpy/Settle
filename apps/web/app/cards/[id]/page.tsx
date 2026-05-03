"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  CnftReceipt,
  PactCard,
  ReceiptCard,
  SlideToConfirm,
  TrustGesture,
} from "@settle/ui";
import { W6AppShell } from "../../../components/w6-app-shell";
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

  // C57 — pacts under this card.
  interface CardPact {
    pact_pubkey: string;
    scope_label: string;
    mode: "oneshot" | "streaming";
    cap_lamports: string | null;
    spent: string | null;
    paused: boolean;
    closed: boolean;
    expiry_slot: string;
    created_at: string;
  }
  const [pacts, setPacts] = useState<CardPact[]>([]);
  const [closingPact, setClosingPact] = useState<string | null>(null);
  const [bulkClosing, setBulkClosing] = useState(false);

  useEffect(() => {
    if (!params.id) return;
    void fetch(`/api/cards/${params.id}/pacts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { pacts?: CardPact[] } | null) => {
        if (j?.pacts) setPacts(j.pacts);
      });
  }, [params.id]);

  async function closePact(pactPubkey: string) {
    if (!connected || !publicKey || !signTransaction) {
      return toast.error("Connect wallet to close pact.");
    }
    setClosingPact(pactPubkey);
    try {
      // Reuse the existing /revoke endpoint — kind='pact' closes the
      // specific pact (close_pact ix) and refunds vault USDC to authority.
      // The endpoint resolves the pact from the URL param when kind='pact',
      // so we hit the per-pact route instead.
      const buildRes = await fetch(`/api/cards/${pactPubkey}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authority: publicKey.toBase58(), kind: "pact" }),
      });
      if (!buildRes.ok) {
        const err = await buildRes.json();
        throw new Error(err.error ?? "build_failed");
      }
      const { transaction } = (await buildRes.json()) as { transaction: string };
      const tx = Transaction.from(Buffer.from(transaction, "base64"));
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
      // Optimistic flip.
      setPacts(
        pacts.map((p) =>
          p.pact_pubkey === pactPubkey ? { ...p, closed: true } : p,
        ),
      );
      toast.success(`Pact closed. Vault refunded.`, {
        action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(sig), "_blank") },
      });
    } catch (e) {
      toast.error(`Close failed: ${(e as Error).message}`);
    } finally {
      setClosingPact(null);
    }
  }

  /**
   * C58 — close every open pact under this card in one signed tx.
   * Solana tx size limits us to ~6 pacts per call; we batch in chunks
   * client-side and surface a "still N to close" toast between batches
   * so the user knows there's more wallet signing coming.
   */
  async function bulkClosePacts() {
    if (!connected || !publicKey || !signTransaction) {
      return toast.error("Connect wallet to close pacts.");
    }
    const open = pacts.filter((p) => !p.closed).map((p) => p.pact_pubkey);
    if (open.length === 0) return;
    setBulkClosing(true);
    const BATCH = 6;
    let closedCount = 0;
    try {
      for (let i = 0; i < open.length; i += BATCH) {
        const batch = open.slice(i, i + BATCH);
        const buildRes = await fetch(`/api/cards/${params.id}/bulk-close`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            authority: publicKey.toBase58(),
            pact_pubkeys: batch,
          }),
        });
        if (!buildRes.ok) {
          const err = await buildRes.json();
          throw new Error(err.error ?? `build_failed_${buildRes.status}`);
        }
        const { transaction } = (await buildRes.json()) as { transaction: string };
        const tx = Transaction.from(Buffer.from(transaction, "base64"));
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
        // Optimistic flip.
        setPacts((prev) =>
          prev.map((p) =>
            batch.includes(p.pact_pubkey) ? { ...p, closed: true } : p,
          ),
        );
        closedCount += batch.length;
        if (i + BATCH < open.length) {
          toast.message(
            `${closedCount} closed · ${open.length - closedCount} more to sign.`,
          );
        }
      }
      toast.success(`Closed ${closedCount} pacts. Vault USDC refunded.`);
    } catch (e) {
      toast.error(
        `Bulk close failed after ${closedCount} closures: ${(e as Error).message}`,
      );
    } finally {
      setBulkClosing(false);
    }
  }

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
    <W6AppShell>
    <div style={{ maxWidth: 760 }}>
      <div style={{ marginBottom: 24 }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>
          {revoked ? "Card · revoked" : "Card · active"}
        </div>
        <h1
          className="w6-heading"
          style={{ fontSize: 28, margin: "8px 0 0", lineHeight: 1.05 }}
        >
          <code className="w6-mono" style={{ fontSize: 22 }}>
            {params.id.slice(0, 8)}…{params.id.slice(-6)}
          </code>
        </h1>
        <p
          className="w6-muted"
          style={{
            marginTop: 8,
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          AgentCard detail. Below: progress + allowlist · pacts opened
          under this card · recent decisions feed.
        </p>
        {revokeSig && (
          <a
            href={getSolscanUrl(revokeSig)}
            target="_blank"
            rel="noreferrer"
            className="w6-btn w6-btn-secondary w6-btn-sm"
            style={{ marginTop: 12 }}
          >
            Revoke tx · Solscan ↗
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

      {/* F3.8 Killchain — entire-card revoke gated by slide-to-confirm.
          Distinct from the pact-level revoke (which closes one task scope);
          this nukes the whole card and the agent loses every active pact
          underneath. The slide gesture prevents accidental kills. */}
      {!revoked && (
        <section
          className="w6-card"
          style={{
            padding: 20,
            marginTop: 24,
            borderColor: "var(--w6-bad)",
            background: "rgba(179, 38, 30, 0.04)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <h3
              className="w6-heading"
              style={{
                fontSize: 14,
                margin: 0,
                color: "var(--w6-bad)",
              }}
            >
              Kill the card
            </h3>
            <span
              className="w6-muted"
              style={{ fontSize: 11 }}
            >
              irreversible
            </span>
          </div>
          <p
            className="w6-muted"
            style={{ marginTop: 6, fontSize: 12, lineHeight: 1.55 }}
          >
            Slide to revoke. The card stops accepting spends instantly,
            every pact under it freezes, and any unspent vault USDC stays
            claimable via close_pact.
          </p>
          <div style={{ marginTop: 16 }}>
            <SlideToConfirm
              label="Slide to revoke card →"
              onConfirm={() => void handleRevoke("card")}
              disabled={revoked}
            />
          </div>
        </section>
      )}

      {/* C57 + C58 — Pacts under this card. */}
      {pacts.length > 0 && (
        <section className="mt-12">
          <div className="mb-3 flex items-end justify-between gap-4">
            <h2 className="text-lg font-medium">Pacts</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#71717a]">
                {pacts.filter((p) => !p.closed).length} open · {pacts.length} total
              </span>
              {/* C58 — bulk close. Only show when ≥2 open pacts so the
                  single-pact case keeps using the per-row button. */}
              {pacts.filter((p) => !p.closed).length >= 2 && (
                <button
                  onClick={() => bulkClosePacts()}
                  disabled={bulkClosing}
                  className="w6-btn w6-btn-secondary w6-btn-sm"
                  style={{
                    borderColor: "var(--w6-bad)",
                    color: "var(--w6-bad)",
                  }}
                >
                  {bulkClosing
                    ? "Closing all…"
                    : `Close all ${pacts.filter((p) => !p.closed).length} open`}
                </button>
              )}
            </div>
          </div>
          <ul className="grid gap-2">
            {pacts.map((p) => {
              const cap = p.cap_lamports ? Number(p.cap_lamports) / 1e6 : null;
              const spent = p.spent ? Number(p.spent) / 1e6 : null;
              const fillPct =
                cap && cap > 0 && spent !== null
                  ? Math.min(100, (spent / cap) * 100)
                  : 0;
              return (
                <li
                  key={p.pact_pubkey}
                  className={`rounded-2xl border p-4 text-xs ${
                    p.closed
                      ? "border-[#e4e4e7] bg-[#fafafa] opacity-60"
                      : "border-[#e4e4e7] bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <div className="font-medium">
                        {p.scope_label}{" "}
                        <span className="text-[#71717a]">· {p.mode}</span>
                      </div>
                      <code className="mt-1 block break-all text-[10px] text-[#52525b]">
                        {p.pact_pubkey}
                      </code>
                    </div>
                    {p.closed ? (
                      <span className="rounded-full border border-[#a1a1aa] bg-[#f4f4f5] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#52525b]">
                        closed
                      </span>
                    ) : p.paused ? (
                      <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                        paused
                      </span>
                    ) : (
                      <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                        open
                      </span>
                    )}
                  </div>

                  {cap !== null && (
                    <>
                      <div className="mt-3 flex items-baseline justify-between text-[#27272a]">
                        <span>
                          ${spent?.toFixed(2) ?? "0.00"} / ${cap.toFixed(2)}{" "}
                          USDC
                        </span>
                        <span className="text-[#71717a]">
                          {fillPct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#e4e4e7]">
                        <div
                          className="h-full bg-accent"
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    </>
                  )}

                  {!p.closed && (
                    <button
                      onClick={() => closePact(p.pact_pubkey)}
                      disabled={closingPact === p.pact_pubkey}
                      className="mt-3 rounded-full border border-red-400/40 bg-red-400/[0.04] px-3 py-1 text-[11px] text-red-200 hover:bg-red-400/10 disabled:opacity-50"
                    >
                      {closingPact === p.pact_pubkey
                        ? "Closing…"
                        : "Close · refund vault"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="mt-12 flex items-end justify-between gap-4">
        <h2 className="text-lg font-medium">Receipts</h2>
        <span className="text-xs text-[#71717a]">
          {filteredReceipts.length} of {receipts.length}
        </span>
      </div>

      {receipts.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={filterMerchant}
            onChange={(e) => setFilterMerchant(e.target.value)}
            placeholder="Search merchant or path…"
            className="flex-1 min-w-[200px] rounded-full border border-[#e4e4e7] bg-transparent px-4 py-2 text-xs outline-none focus:border-accent"
          />
          <div className="flex gap-1 rounded-full border border-[#e4e4e7] bg-white/[0.02] p-1 text-xs">
            {(["all", "ALLOW", "DENY", "REVIEW"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilterDecision(k)}
                className={
                  filterDecision === k
                    ? "rounded-full bg-accent px-3 py-1 text-background"
                    : "rounded-full px-3 py-1 text-[#52525b] hover:text-[#09090b]"
                }
              >
                {k.toLowerCase()}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-full border border-[#e4e4e7] bg-white/[0.02] p-1 text-xs">
            {(["all", "1", "7", "30"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilterDays(k)}
                className={
                  filterDays === k
                    ? "rounded-full bg-accent px-3 py-1 text-background"
                    : "rounded-full px-3 py-1 text-[#52525b] hover:text-[#09090b]"
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
          <div className="h-20 animate-pulse rounded-2xl border border-[#e4e4e7] bg-white/[0.02]" />
          <div className="h-20 animate-pulse rounded-2xl border border-[#e4e4e7] bg-white/[0.02]" />
        </div>
      ) : receiptsError === "supabase_unconfigured" ? (
        <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-300">
          Supabase not configured. Set <code>SUPABASE_URL</code> +{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY</code>, apply migrations, run{" "}
          <code>pnpm seed:supabase</code>.
        </div>
      ) : receipts.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-6 text-sm text-[#52525b]">
          No receipts yet. The agent hasn&apos;t spent anything on this card.
        </div>
      ) : filteredReceipts.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-6 text-sm text-[#52525b]">
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
    </div>
    </W6AppShell>
  );
}
