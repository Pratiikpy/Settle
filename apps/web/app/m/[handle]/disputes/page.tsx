"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { W6AppShell } from "../../../../components/w6-app-shell";
import { getSolscanUrl } from "../../../../lib/solana";
import { fetchAuthHeaders, asAuthHeaders } from "../../../../lib/client-auth";

/**
 * F4.6 + C90 — Merchant-side dispute inbox + resolution.
 * Bug #28 fix: redirects /m/me/disputes → /m/<own-handle>/disputes when connected.
 *
 * Lists pending refund_requests with the buyer's emoji + reason. The
 * merchant can:
 *   - Generate an AI-drafted response via /api/disputes/draft (C18)
 *   - Approve refund: builds a TransferChecked tx for the merchant
 *     to sign, returning USDC to the buyer's wallet.
 *   - Deny with a written response.
 *
 * Auth model: only the merchant whose handle this is can resolve
 * (verified server-side by joining handle → merchant_pubkey →
 * receipt.merchant_pubkey). The page renders for anyone, but the
 * resolve API enforces the wallet match.
 */

interface DisputeRow {
  id: string;
  request_id: string;
  pact_pubkey: string | null;
  authority_pubkey: string;
  reason: string;
  emoji: string | null;
  created_at: string;
  resolution_decision: "pending" | "approved_refund" | "denied";
  decided_at: string | null;
  refund_signature: string | null;
  merchant_response: string | null;
  amount_lamports: string | null;
  receipt_kind: string | null;
  receipt_decision: string | null;
}

interface DisputesResponse {
  ok: boolean;
  handle: string;
  merchant_pubkey: string;
  count: number;
  disputes: DisputeRow[];
  error?: string;
  message?: string;
}

function fmtUsdc(lamports: string | null): string {
  if (!lamports) return "—";
  const n = Number(lamports);
  return (n / 1e6).toFixed(2);
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export default function MerchantDisputesPage() {
  const params = useParams<{ handle: string }>();
  const router = useRouter();
  const { publicKey, signTransaction, signMessage } = useWallet();
  const { connection } = useConnection();
  const [data, setData] = useState<DisputesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [denyText, setDenyText] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [meRedirected, setMeRedirected] = useState(false);

  // Bug #28: when the route is /m/me/disputes (the literal "me" placeholder)
  // and the user is connected, look up their actual handle and redirect to
  // /m/<handle>/disputes. If they have no handle, surface a friendly CTA
  // instead of a raw "handle_not_found" stripe.
  useEffect(() => {
    if (params.handle !== "me") return;
    if (!publicKey) return;
    let cancelled = false;
    fetch(`/api/handles/by-pubkey?pubkey=${publicKey.toBase58()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { handle?: string } | null) => {
        if (cancelled) return;
        if (j?.handle) router.replace(`/m/${j.handle}/disputes`);
        else setMeRedirected(true); // signal: connected but no handle
      })
      .catch(() => setMeRedirected(true));
    return () => {
      cancelled = true;
    };
  }, [params.handle, publicKey, router]);

  async function reload() {
    if (!params.handle) return;
    if (params.handle === "me") return; // Wait for redirect resolution
    setLoading(true);
    const r = await fetch(`/api/merchants/${params.handle}/disputes`);
    const j = (await r.json()) as DisputesResponse;
    setData(j);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.handle]);

  async function draftReply(d: DisputeRow) {
    setBusy({ ...busy, [`draft-${d.id}`]: true });
    try {
      const r = await fetch("/api/disputes/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: d.request_id }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error ?? "draft_failed");
      }
      const j = (await r.json()) as { draft: string; provider: string };
      setDrafts({ ...drafts, [d.id]: j.draft });
      setDenyText({ ...denyText, [d.id]: j.draft }); // pre-fill deny too
      toast.success(`Draft generated via ${j.provider}.`);
    } catch (e) {
      toast.error(`Draft failed: ${(e as Error).message}`);
    } finally {
      setBusy({ ...busy, [`draft-${d.id}`]: false });
    }
  }

  async function approve(d: DisputeRow) {
    if (!publicKey || !signTransaction || !signMessage) {
      return toast.error("Connect wallet to approve.");
    }
    setBusy({ ...busy, [`approve-${d.id}`]: true });
    try {
      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      // Phase 1: get unsigned refund tx
      const buildRes = await fetch(
        `/api/merchants/${params.handle}/disputes/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...asAuthHeaders(auth) },
          body: JSON.stringify({
            request_id: d.request_id,
            merchant_pubkey: publicKey.toBase58(),
            decision: "approved_refund",
            merchant_response: drafts[d.id] ?? null,
          }),
        },
      );
      if (!buildRes.ok) {
        const err = await buildRes.json();
        throw new Error(err.error ?? `build_failed_${buildRes.status}`);
      }
      const built = (await buildRes.json()) as {
        transaction: string;
        amount_usdc: string;
        buyer_pubkey: string;
      };
      toast.message(
        `Refunding $${built.amount_usdc} USDC to ${built.buyer_pubkey.slice(0, 6)}…. Sign in your wallet.`,
      );

      const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
      const signed = await signTransaction(tx);
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

      // Phase 2: stamp the row.
      const auth2 = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      const finalizeRes = await fetch(
        `/api/merchants/${params.handle}/disputes/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...asAuthHeaders(auth2) },
          body: JSON.stringify({
            request_id: d.request_id,
            merchant_pubkey: publicKey.toBase58(),
            decision: "approved_refund",
            merchant_response: drafts[d.id] ?? null,
            refund_signature: sig,
          }),
        },
      );
      if (!finalizeRes.ok) {
        toast.error("Refund sent on-chain but row finalize failed. Refresh.");
      } else {
        toast.success(`Refunded $${built.amount_usdc} USDC.`);
        await reload();
      }
    } catch (e) {
      toast.error(`Approve failed: ${(e as Error).message}`);
    } finally {
      setBusy({ ...busy, [`approve-${d.id}`]: false });
    }
  }

  async function deny(d: DisputeRow) {
    if (!publicKey || !signMessage) return toast.error("Connect wallet to deny.");
    setBusy({ ...busy, [`deny-${d.id}`]: true });
    try {
      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      const r = await fetch(
        `/api/merchants/${params.handle}/disputes/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...asAuthHeaders(auth) },
          body: JSON.stringify({
            request_id: d.request_id,
            merchant_pubkey: publicKey.toBase58(),
            decision: "denied",
            merchant_response: denyText[d.id] ?? drafts[d.id] ?? null,
          }),
        },
      );
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error ?? "deny_failed");
      }
      toast.success("Denied.");
      await reload();
    } catch (e) {
      toast.error(`Deny failed: ${(e as Error).message}`);
    } finally {
      setBusy({ ...busy, [`deny-${d.id}`]: false });
    }
  }

  return (
    <W6AppShell forceSurface="merchant">
      <div style={{ maxWidth: 760 }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>
          Merchant · disputes
        </div>
        <h1
          className="w6-heading"
          style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
        >
          @{params.handle} · dispute inbox
        </h1>
        <p
          className="w6-muted"
          style={{
            fontSize: 14,
            marginTop: 8,
            maxWidth: 640,
            lineHeight: 1.5,
            marginBottom: 24,
          }}
        >
          Refunds your customers have requested. Generate an AI draft,
          then approve (sends USDC back on-chain) or deny with a written
          response.
        </p>

        {loading && <p className="mt-8 text-sm text-[#52525b]">Loading…</p>}

        {data && !data.ok && (
          <div className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-5 text-sm text-red-300">
            {data.message ?? data.error ?? "Failed to load."}
          </div>
        )}

        {data?.ok && (
          <>
            <div className="mt-6 flex items-baseline gap-3 text-xs text-[#52525b]">
              <span className="text-base font-medium text-[#27272a]">
                {data.count}
              </span>
              <span>{data.count === 1 ? "dispute" : "disputes"} · last 30 days</span>
            </div>

            {data.disputes.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-8 text-center text-sm text-[#52525b]">
                No disputes — your customers are happy.
              </div>
            ) : (
              <ul className="mt-6 grid gap-3">
                {data.disputes.map((d) => {
                  const isPending = d.resolution_decision === "pending";
                  const isApproved = d.resolution_decision === "approved_refund";
                  const isDenied = d.resolution_decision === "denied";
                  return (
                    <li
                      key={d.id}
                      className={`rounded-2xl border p-5 ${
                        isApproved
                          ? "border-emerald-400/30 bg-emerald-400/[0.03]"
                          : isDenied
                            ? "border-[#e4e4e7] bg-[#fafafa] opacity-70"
                            : "border-[#e4e4e7] bg-[#fafafa]"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="flex items-baseline gap-3">
                          {d.emoji && <span className="text-2xl">{d.emoji}</span>}
                          <span className="text-sm font-medium">
                            ${fmtUsdc(d.amount_lamports)} USDC
                          </span>
                          <span className="text-[10px] uppercase tracking-wide text-[#71717a]">
                            {d.receipt_kind ?? "x402_spend"}
                          </span>
                          {isApproved && (
                            <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                              ✓ refunded
                            </span>
                          )}
                          {isDenied && (
                            <span className="rounded-full border border-[#a1a1aa] bg-[#f4f4f5] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[#52525b]">
                              denied
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-[#71717a]">
                          {timeAgo(d.created_at)}
                        </span>
                      </div>
                      {d.reason && (
                        <p className="mt-3 text-sm text-[#09090b]/75">{d.reason}</p>
                      )}
                      <div className="mt-3 flex items-center justify-between gap-3 text-[11px]">
                        <span className="font-mono text-[#71717a]">
                          from {d.authority_pubkey.slice(0, 6)}…{d.authority_pubkey.slice(-4)}
                        </span>
                        <Link
                          href={`/receipts/${d.request_id}`}
                          className="text-[#52525b] hover:text-[#09090b]"
                        >
                          Open receipt →
                        </Link>
                      </div>

                      {/* Resolved state — show what happened. */}
                      {isApproved && d.refund_signature && (
                        <div className="mt-3 text-[11px] text-emerald-300/80">
                          <a
                            href={getSolscanUrl(d.refund_signature)}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            Refund tx ↗
                          </a>
                          {d.decided_at && (
                            <span className="ml-3 text-emerald-300/50">
                              {timeAgo(d.decided_at)}
                            </span>
                          )}
                        </div>
                      )}
                      {(isApproved || isDenied) && d.merchant_response && (
                        <div className="mt-3 rounded-lg bg-[#fafafa] p-3 text-[11px] text-[#52525b]">
                          <p className="text-[10px] uppercase tracking-wide text-[#71717a]">
                            Your response
                          </p>
                          <p className="mt-1 whitespace-pre-wrap">{d.merchant_response}</p>
                        </div>
                      )}

                      {/* Pending state — show actions. */}
                      {isPending && (
                        <div className="mt-4 rounded-lg border border-[#e4e4e7] bg-[#fafafa] p-3">
                          {drafts[d.id] && (
                            <div className="mb-3">
                              <p className="text-[10px] uppercase tracking-wide text-[#71717a]">
                                AI draft
                              </p>
                              <textarea
                                value={denyText[d.id] ?? drafts[d.id]}
                                onChange={(e) =>
                                  setDenyText({
                                    ...denyText,
                                    [d.id]: e.target.value,
                                  })
                                }
                                rows={6}
                                className="mt-1 w-full rounded border border-[#e4e4e7] bg-transparent p-2 text-xs"
                              />
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => draftReply(d)}
                              disabled={busy[`draft-${d.id}`]}
                              className="rounded-full border border-[#a1a1aa] px-3 py-1.5 text-[11px] hover:bg-[#f4f4f5] disabled:opacity-50"
                            >
                              {busy[`draft-${d.id}`] ? "Drafting…" : "✎ AI draft"}
                            </button>
                            <button
                              onClick={() => approve(d)}
                              disabled={busy[`approve-${d.id}`]}
                              className="rounded-full bg-emerald-500/15 border border-emerald-400/40 px-3 py-1.5 text-[11px] text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                            >
                              {busy[`approve-${d.id}`]
                                ? "Refunding…"
                                : `Approve · refund $${fmtUsdc(d.amount_lamports)}`}
                            </button>
                            <button
                              onClick={() => deny(d)}
                              disabled={busy[`deny-${d.id}`]}
                              className="rounded-full border border-[#a1a1aa] px-3 py-1.5 text-[11px] hover:bg-[#f4f4f5] disabled:opacity-50"
                            >
                              {busy[`deny-${d.id}`] ? "Saving…" : "Deny with response"}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-8 flex gap-3">
              <Link
                href={`/m/${params.handle}/analytics`}
                className="inline-flex h-10 items-center rounded-full border border-[#a1a1aa] px-5 text-xs hover:bg-[#f4f4f5]"
              >
                ← Analytics
              </Link>
              <Link
                href={`/m/${params.handle}`}
                className="inline-flex h-10 items-center rounded-full border border-[#a1a1aa] px-5 text-xs hover:bg-[#f4f4f5]"
              >
                Profile
              </Link>
            </div>
          </>
        )}
      </div>
    </W6AppShell>
  );
}
