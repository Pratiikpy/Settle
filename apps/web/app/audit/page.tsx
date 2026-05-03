"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { formatUsdc } from "@settle/sdk";
import { W6AppShell } from "../../components/w6-app-shell";
import { LocaleSwitcher } from "../../components/locale-switcher";
import { useTranslate } from "../../lib/i18n";
import { getSolscanUrl } from "../../lib/solana";

/**
 * /audit — Phase 5 execution log.
 *
 * The honest answer to "is my wish actually firing?" Each row in
 * phase5_executions is one cron-tick decision: what the signer chose
 * to do, whether it actually fired on-chain, and why if it didn't.
 *
 * Status legend:
 *   dry_run_logged → signer noticed the intent but mode != live
 *   sent           → tx sent to chain, confirmation pending
 *   confirmed      → tx landed (final happy state)
 *   failed         → pre-fire gate failed OR on-chain tx errored
 *
 * The page lives at /audit (not /settings/audit or similar) because
 * audit logs are a first-class trust artifact — Settle's selling
 * point is "verifiable money," and the audit log proves we did what
 * we said we'd do. Burying it under settings would understate that.
 */

interface ExecutionRow {
  execution_id: string;
  intent_kind: string;
  intent_id: string;
  mode: "dry_run" | "live";
  status: "dry_run_logged" | "sent" | "confirmed" | "failed" | "pending";
  signature: string | null;
  plan_json: {
    why?: string;
    amount_lamports?: string;
    dest_pubkey?: string;
    source_pubkey?: string;
    pact_pubkey?: string | null;
    card_delegation_validated?: boolean;
    pact_ready?: boolean;
    relayer_pubkey?: string | null;
    kernel_hashes?: { receipt_hash: string; context_hash: string } | null;
  };
  error_message: string | null;
  created_at: string;
  confirmed_at: string | null;
}

interface AuditResponse {
  ok: true;
  wallet: string;
  executions: ExecutionRow[];
  summary: {
    dry_run_logged: number;
    sent: number;
    confirmed: number;
    failed: number;
  };
}

const STATUS_BADGE: Record<ExecutionRow["status"], string> = {
  dry_run_logged: "border-[#a1a1aa] bg-[#f4f4f5] text-[#27272a]",
  pending: "border-[#a1a1aa] bg-[#f4f4f5] text-[#27272a]",
  sent: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  confirmed: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  failed: "border-red-400/40 bg-red-400/10 text-red-200",
};

const STATUS_LABEL: Record<ExecutionRow["status"], string> = {
  dry_run_logged: "dry run",
  pending: "pending",
  sent: "sent",
  confirmed: "confirmed ✓",
  failed: "failed",
};

const KIND_LABEL: Record<string, string> = {
  scheduled_send: "Scheduled send",
  auto_refill: "Auto-refill",
  gift_claim: "Gift claim",
  gift_refund: "Gift refund",
  gift_sender: "Gift",
};

export default function AuditPage() {
  const { connected, publicKey } = useWallet();
  const { t } = useTranslate();
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!publicKey) return;
    setLoading(true);
    fetch(`/api/audit/phase5?wallet=${publicKey.toBase58()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: AuditResponse | null) => setData(j))
      .finally(() => setLoading(false));
  }, [publicKey]);

  const grouped = useMemo(() => {
    if (!data) return new Map<string, ExecutionRow[]>();
    const m = new Map<string, ExecutionRow[]>();
    for (const e of data.executions) {
      const key = e.intent_kind;
      const list = m.get(key) ?? [];
      list.push(e);
      m.set(key, list);
    }
    return m;
  }, [data]);

  return (
    <W6AppShell>
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="w6-heading" style={{ fontSize: 32, lineHeight: 1.1, margin: 0 }}>
              {t("audit.title")}
            </h1>
            <p className="mt-2 text-sm text-[#52525b]">
              {t("audit.subtitle")}
            </p>
          </div>
          <LocaleSwitcher className="self-start" />
        </header>

        {!connected ? (
          <p className="text-sm text-[#52525b]">
            Connect your wallet to see your audit log.
          </p>
        ) : loading ? (
          <p className="text-sm text-[#52525b]">Loading…</p>
        ) : !data || data.executions.length === 0 ? (
          <div className="rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-8 text-center">
            <p className="text-sm text-[#52525b]">No fires yet.</p>
            <p className="mt-2 text-xs text-[#71717a]">
              Create a scheduled send on{" "}
              <Link href="/wishes" className="text-accent hover:underline">
                /wishes
              </Link>{" "}
              and wait for the next 5-minute cron tick. Dry-run rows appear
              even before live mode is enabled.
            </p>
          </div>
        ) : (
          <>
            {/* Summary band */}
            <section className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat
                label="Dry runs"
                value={data.summary.dry_run_logged.toLocaleString()}
                tone="neutral"
              />
              <Stat
                label="Sent"
                value={data.summary.sent.toLocaleString()}
                tone="amber"
              />
              <Stat
                label="Confirmed"
                value={data.summary.confirmed.toLocaleString()}
                tone="emerald"
              />
              <Stat
                label="Failed"
                value={data.summary.failed.toLocaleString()}
                tone="red"
              />
            </section>

            {/* Grouped by intent kind */}
            {Array.from(grouped.entries()).map(([kind, rows]) => (
              <section
                key={kind}
                className="mb-6 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5"
              >
                <header className="mb-3 flex items-baseline justify-between">
                  <h2 className="text-sm font-medium">
                    {KIND_LABEL[kind] ?? kind}{" "}
                    <span className="text-[#71717a]">· {rows.length}</span>
                  </h2>
                </header>
                <ul className="space-y-2">
                  {rows.map((r) => (
                    <li
                      key={r.execution_id}
                      className="rounded-xl border border-[#f4f4f5] bg-[#fafafa] p-3 text-xs"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="text-[#27272a]">
                          {r.plan_json.amount_lamports && (
                            <strong>
                              {formatUsdc(r.plan_json.amount_lamports)}
                            </strong>
                          )}
                          {r.plan_json.dest_pubkey && (
                            <>
                              {" "}
                              →{" "}
                              <code className="text-[#52525b]">
                                {r.plan_json.dest_pubkey.slice(0, 6)}…
                                {r.plan_json.dest_pubkey.slice(-4)}
                              </code>
                            </>
                          )}
                        </div>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_BADGE[r.status]}`}
                        >
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>

                      {r.plan_json.why && (
                        <p className="mt-1 text-[#71717a]">
                          {r.plan_json.why}
                        </p>
                      )}

                      {/* Validation gates */}
                      {(r.plan_json.card_delegation_validated === false ||
                        r.plan_json.pact_ready === false) && (
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                          {r.plan_json.card_delegation_validated === false && (
                            <span className="rounded bg-red-400/10 px-1.5 py-0.5 text-red-300">
                              card not delegated
                            </span>
                          )}
                          {r.plan_json.pact_ready === false && (
                            <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-amber-300">
                              no pact attached
                            </span>
                          )}
                        </div>
                      )}

                      {/* Error message */}
                      {r.error_message && (
                        <p className="mt-2 rounded bg-red-400/5 p-2 text-[11px] text-red-200/80">
                          {r.error_message}
                        </p>
                      )}

                      {/* Tx signature + kernel hash links */}
                      {r.signature && (
                        <div className="mt-2 flex items-baseline gap-3 text-[11px]">
                          <a
                            href={getSolscanUrl(r.signature)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent hover:underline"
                          >
                            Solscan ↗
                          </a>
                          {r.plan_json.kernel_hashes?.context_hash && (
                            <code className="text-[#71717a]">
                              ctx{" "}
                              {r.plan_json.kernel_hashes.context_hash.slice(
                                0,
                                10,
                              )}
                              …
                            </code>
                          )}
                        </div>
                      )}

                      <p className="mt-2 text-[10px] text-[#a1a1aa]">
                        {new Date(r.created_at).toLocaleString()}
                        {r.confirmed_at &&
                          ` · confirmed ${new Date(r.confirmed_at).toLocaleTimeString()}`}
                        {" · "}
                        {r.mode === "live" ? "live mode" : "dry-run mode"}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </div>
    </W6AppShell>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "amber" | "emerald" | "red";
}) {
  const toneCls = {
    neutral: "border-[#e4e4e7] text-[#27272a]",
    amber: "border-amber-400/30 text-amber-200",
    emerald: "border-emerald-400/30 text-emerald-200",
    red: "border-red-400/30 text-red-200",
  }[tone];
  return (
    <div className={`rounded-2xl border bg-white/[0.02] p-4 ${toneCls}`}>
      <p className="text-[11px] uppercase tracking-wide text-[#71717a]">
        {label}
      </p>
      <p className="mt-1 text-base">{value}</p>
    </div>
  );
}
