"use client";

import Link from "next/link";
import { getSolscanUrl } from "../lib/solana";

/**
 * Receipt-as-story timeline.
 *
 * Renders a forensic chronological narration of a receipt: when the request was
 * initiated, when the policy check passed, when the on-chain commit landed, when
 * the merchant call started + returned, the four-hash chain commitments, and the
 * `@settle/sdk verifyReceipt` snippet a third party can use to independently
 * verify the chain.
 *
 * Pure data → narrative shape transformation. Every value comes from the
 * existing /api/receipts/[requestId] response — no new state, no new RPC.
 *
 * Designed to slot ABOVE the existing functional surfaces (voice recorder,
 * refund button, EscrowState) so the page becomes story-led but every existing
 * action stays where it is. A "Hide timeline" toggle lets users collapse this
 * if they want the raw panel-only view.
 */

interface ReceiptForTimeline {
  request_id: string;
  card_pubkey: string;
  pact_pubkey: string | null;
  merchant_pubkey: string;
  amount_lamports: string;
  decision: "ALLOW" | "DENY" | "REVIEW";
  deny_code: number | null;
  capability_hash: string | null;
  purpose_text_hash: string | null;
  purpose_hash: string | null;
  receipt_hash: string | null;
  reason_hash: string | null;
  policy_snapshot_hash: string | null;
  target_method: string;
  target_path: string;
  sig_solscan: string | null;
  decision_slot: number;
  policy_version: number;
  created_at: string;
  request_initiated_at?: string | null;
  upstream_called_at?: string | null;
  upstream_returned_at?: string | null;
  submission_method?: "helius_sender_jito" | "rpc_fallback" | "wallet_send";
}

function lamportsToUsd(s: string): string {
  const n = BigInt(s);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return `$${whole}.${frac.toString().padStart(6, "0").slice(0, 4)}`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().replace("T", " ").slice(0, 19) + " UTC";
  } catch {
    return iso;
  }
}

function deltaMs(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a || !b) return null;
  try {
    const ms = new Date(b).getTime() - new Date(a).getTime();
    if (!Number.isFinite(ms)) return null;
    return ms >= 0 ? `+${ms} ms` : `${ms} ms`;
  } catch {
    return null;
  }
}

function shortHash(h: string | null): string {
  if (!h) return "—";
  return `${h.slice(0, 8)}…${h.slice(-6)}`;
}

export function ReceiptTimeline({ r }: { r: ReceiptForTimeline }) {
  const t0 = r.request_initiated_at;
  const tUpStart = r.upstream_called_at;
  const tUpEnd = r.upstream_returned_at;
  const tCommit = r.created_at;
  const isAllow = r.decision === "ALLOW";

  // Render slot relative-time deltas where we have both endpoints.
  const policyDelta = deltaMs(t0, tUpStart);
  const upstreamDelta = deltaMs(tUpStart, tUpEnd);
  const totalDelta = deltaMs(t0, tCommit);

  const submissionLabel =
    r.submission_method === "helius_sender_jito"
      ? "Helius Sender · Jito bundle"
      : r.submission_method === "rpc_fallback"
        ? "RPC sendRawTransaction (Sender unavailable)"
        : r.submission_method === "wallet_send"
          ? "Wallet sendRawTransaction"
          : null;

  return (
    <section className="mt-6 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Forensic timeline</h2>
        <span className="text-[10px] uppercase tracking-wider text-[#71717a]">
          slot {r.decision_slot}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-[#71717a]">
        Server-clock-consistent timing captured by the x402 proxy in the same
        process. Pre-P10 receipts (NULL timing) skip the relevant rows honestly.
      </p>

      <ol className="mt-5 space-y-4 border-l border-[#e4e4e7] pl-4">
        {/* 1. Request initiated */}
        <li>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-medium">🕐 Request initiated</div>
            <div className="font-mono text-[10px] text-[#71717a]">
              {fmtTime(t0)}
            </div>
          </div>
          <div className="mt-1 text-[11px] text-[#09090b]/65">
            <span className="text-[#71717a]">Card</span>{" "}
            <span className="font-mono">{r.card_pubkey.slice(0, 6)}…{r.card_pubkey.slice(-4)}</span>{" "}
            requested capability{" "}
            <span className="font-mono">{r.capability_hash ? shortHash(r.capability_hash) : "—"}</span>{" "}
            from merchant{" "}
            <span className="font-mono">{r.merchant_pubkey.slice(0, 6)}…{r.merchant_pubkey.slice(-4)}</span>{" "}
            for <span className="font-mono font-medium">{lamportsToUsd(r.amount_lamports)}</span>{" "}
            via <span className="font-mono">{r.target_method} {r.target_path}</span>.
          </div>
        </li>

        {/* 2. Policy check */}
        <li>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm font-medium">
              🛡️ Policy check{" "}
              <span
                className={`ml-2 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                  isAllow
                    ? "bg-emerald-500/15 text-emerald-400"
                    : r.decision === "DENY"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {r.decision}
              </span>
            </div>
            <div className="font-mono text-[10px] text-[#71717a]">
              {policyDelta ?? ""}
            </div>
          </div>
          <div className="mt-1 text-[11px] text-[#09090b]/65">
            policy v{r.policy_version}
            {!isAllow && r.deny_code !== null && (
              <span className="ml-2 text-red-400">deny_code = {r.deny_code}</span>
            )}
            {r.pact_pubkey && (
              <>
                {" "}· pact-scoped via{" "}
                <span className="font-mono">{r.pact_pubkey.slice(0, 6)}…{r.pact_pubkey.slice(-4)}</span>
              </>
            )}
          </div>
        </li>

        {/* 3. On-chain commit (only for ALLOW) */}
        {isAllow && (
          <li>
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-medium">⚡ On-chain commit</div>
              <div className="font-mono text-[10px] text-[#71717a]">
                slot {r.decision_slot}
              </div>
            </div>
            <div className="mt-1 text-[11px] text-[#09090b]/65">
              <span className="text-[#71717a]">PolicyDecisionEvent emitted.</span>{" "}
              {r.sig_solscan ? (
                <a
                  href={getSolscanUrl(r.sig_solscan)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-accent hover:underline"
                >
                  tx {r.sig_solscan.slice(0, 8)}…{r.sig_solscan.slice(-6)} ↗
                </a>
              ) : (
                <span className="font-mono text-[#71717a]">no signature</span>
              )}
              {submissionLabel && (
                <>
                  {" "}·{" "}
                  <span
                    className={
                      r.submission_method === "helius_sender_jito"
                        ? "text-emerald-400"
                        : "text-[#52525b]"
                    }
                  >
                    {submissionLabel}
                  </span>
                </>
              )}
            </div>
          </li>
        )}

        {/* 4. Merchant called */}
        {tUpStart && (
          <li>
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-medium">🌐 Merchant called</div>
              <div className="font-mono text-[10px] text-[#71717a]">
                {fmtTime(tUpStart)}
              </div>
            </div>
            <div className="mt-1 text-[11px] text-[#09090b]/65">
              <span className="font-mono">{r.target_method} {r.target_path}</span>
            </div>
          </li>
        )}

        {/* 5. Merchant returned */}
        {tUpEnd && (
          <li>
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-medium">✓ Merchant returned</div>
              <div className="font-mono text-[10px] text-[#71717a]">
                {upstreamDelta ?? ""}
              </div>
            </div>
            <div className="mt-1 text-[11px] text-[#09090b]/65">
              {fmtTime(tUpEnd)}
              {upstreamDelta && (
                <span className="ml-2 text-[#71717a]">
                  (upstream-only latency)
                </span>
              )}
            </div>
          </li>
        )}

        {/* 6. Hash chain */}
        <li>
          <div className="text-sm font-medium">🔐 Hash chain committed</div>
          <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-2">
            <HashRow label="receipt_hash" value={r.receipt_hash} />
            <HashRow label="reason_hash" value={r.reason_hash} />
            <HashRow label="policy_snapshot_hash" value={r.policy_snapshot_hash} />
            <HashRow label="purpose_hash" value={r.purpose_hash} />
            <HashRow label="purpose_text_hash" value={r.purpose_text_hash} />
            <HashRow label="capability_hash" value={r.capability_hash} />
          </div>
          <details className="mt-3 text-[11px] text-[#52525b]">
            <summary className="cursor-pointer hover:text-[#27272a]">
              Verify this chain yourself with @settle/sdk →
            </summary>
            <pre className="mt-2 overflow-auto rounded-lg bg-black/30 p-3 text-[10px] leading-relaxed text-[#09090b]/75">
              <code>{`import { verifyReceipt } from "@settle/sdk";

const { ok } = verifyReceipt({
  receipt: { /* request_id, card, merchant, amount, capability_hash, ... */ },
  reason: { /* decision, deny_code, ... */ },
  policy_snapshot: { /* policy_version, daily_cap, ... */ },
  http: { method: "${r.target_method}", path: "${r.target_path}" },
  expected: {
    receipt_hash:        "${r.receipt_hash ?? "..."}",
    reason_hash:         "${r.reason_hash ?? "..."}",
    policy_snapshot_hash: "${r.policy_snapshot_hash ?? "..."}",
    purpose_hash:        "${r.purpose_hash ?? "..."}",
  },
});

console.log(ok); // true iff the four BLAKE3 hashes recompute to the on-chain commits`}</code>
            </pre>
          </details>
        </li>

        {/* 7. End-to-end summary */}
        {totalDelta && (
          <li>
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-medium">⏱ End-to-end</div>
              <div className="font-mono text-[10px] text-[#71717a]">{totalDelta}</div>
            </div>
            <div className="mt-1 text-[11px] text-[#52525b]">
              From proxy entry to receipt persistence. Server-clock anchored
              (P10 timing columns) — clock-drift-safe.
            </div>
          </li>
        )}
      </ol>

      <p className="mt-5 text-[10px] text-[#71717a]">
        Want the panel-only layout?{" "}
        <Link
          href={`/receipts/${r.request_id}?view=raw`}
          className="text-accent hover:underline"
        >
          Switch to raw view
        </Link>
        .
      </p>
    </section>
  );
}

function HashRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-44 shrink-0 text-[#71717a]">{label}</span>
      <span className="truncate font-mono text-[#09090b]/75" title={value ?? "null"}>
        {value ? `${value.slice(0, 14)}…${value.slice(-8)}` : "null"}
      </span>
    </div>
  );
}
