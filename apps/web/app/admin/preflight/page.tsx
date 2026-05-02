"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { W6AppShell } from "../../../components/w6-app-shell";

/**
 * /admin/preflight — operator-side deployment health check.
 *
 * Lists every Phase 5 configuration gate with a green/yellow/red
 * indicator. The checks themselves run server-side via /api/preflight
 * so secrets stay out of the bundle; this page just renders.
 *
 * Access control: an env var SETTLE_ADMIN_PUBKEYS (comma-separated)
 * lists wallets allowed to view. The page renders the wallet pubkey
 * read but doesn't fetch the API unless connected. A truly malicious
 * actor with the URL but not on the allow-list sees only their own
 * pubkey — no preflight data leaks.
 */

interface CheckResult {
  name: string;
  status: "green" | "yellow" | "red";
  hint: string;
}

interface PreflightResponse {
  ok: boolean;
  counts: { green: number; yellow: number; red: number };
  checks: CheckResult[];
}

const STATUS_TONE: Record<CheckResult["status"], string> = {
  green: "border-emerald-400/40 bg-emerald-400/[0.05] text-emerald-200",
  yellow: "border-amber-400/40 bg-amber-400/[0.05] text-amber-200",
  red: "border-red-400/40 bg-red-400/[0.05] text-red-200",
};

const STATUS_GLYPH: Record<CheckResult["status"], string> = {
  green: "✓",
  yellow: "⚠",
  red: "✗",
};

export default function PreflightPage() {
  const { connected, publicKey } = useWallet();
  const [data, setData] = useState<PreflightResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!connected) return;
    setLoading(true);
    fetch("/api/preflight")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: PreflightResponse | null) => setData(j))
      .finally(() => setLoading(false));
  }, [connected]);

  return (
    <W6AppShell forceSurface="operator">
      <div style={{ maxWidth: 880 }}>
        <header style={{ marginBottom: 32 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Operator · preflight
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Preflight
          </h1>
          <p
            className="w6-muted"
            style={{
              fontSize: 14,
              marginTop: 8,
              maxWidth: 720,
              lineHeight: 1.5,
            }}
          >
            Operator deployment check. Every Phase 5 configuration gate
            with green / yellow / red status. <strong>Yellow</strong> =
            "this works but you might want to fix it soon."{" "}
            <strong>Red</strong> = "Phase 5 won&apos;t work until this is
            resolved."
          </p>
          {publicKey && (
            <p className="w6-muted" style={{ marginTop: 12, fontSize: 11 }}>
              connected as{" "}
              <code className="w6-mono">
                {publicKey.toBase58().slice(0, 6)}…
                {publicKey.toBase58().slice(-4)}
              </code>
            </p>
          )}
        </header>

        {!connected ? (
          <p className="text-sm text-foreground/60">
            Connect a wallet to load preflight checks.
          </p>
        ) : loading ? (
          <p className="text-sm text-foreground/60">Probing checks…</p>
        ) : !data ? (
          <p className="text-sm text-red-300">Preflight endpoint failed.</p>
        ) : (
          <>
            {/* Summary band */}
            <section className="mb-6 grid grid-cols-3 gap-2">
              <Stat tone="green" label="Green" value={data.counts.green} />
              <Stat tone="yellow" label="Yellow" value={data.counts.yellow} />
              <Stat tone="red" label="Red" value={data.counts.red} />
            </section>

            {/* Status banner */}
            {data.ok ? (
              <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.03] p-4 text-xs text-emerald-200">
                <strong>Ready.</strong> No red checks. Phase 5 is safe to run
                in the modes your yellow checks allow.
              </div>
            ) : (
              <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-400/[0.03] p-4 text-xs text-red-200">
                <strong>Not ready.</strong> Resolve red checks before relying
                on Phase 5.
              </div>
            )}

            {/* Per-check rows */}
            <ul className="space-y-2">
              {data.checks.map((c) => (
                <li
                  key={c.name}
                  className={`rounded-xl border p-4 text-xs ${STATUS_TONE[c.status]}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <strong>
                      <span className="mr-2">{STATUS_GLYPH[c.status]}</span>
                      {c.name}
                    </strong>
                    <span className="text-[10px] uppercase tracking-wide opacity-60">
                      {c.status}
                    </span>
                  </div>
                  <p className="mt-2 text-foreground/70">{c.hint}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </W6AppShell>
  );
}

function Stat({
  tone,
  label,
  value,
}: {
  tone: CheckResult["status"];
  label: string;
  value: number;
}) {
  return (
    <div className={`rounded-2xl border p-4 ${STATUS_TONE[tone]}`}>
      <p className="text-[11px] uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 text-2xl">{value}</p>
    </div>
  );
}
