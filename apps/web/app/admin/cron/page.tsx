"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { W6AppShell } from "../../../components/w6-app-shell";
import { getSolscanUrl } from "../../../lib/solana";

/**
 * /admin/cron — operator on-demand cron firing + recent fires log.
 *
 * Fills the gap between Vercel Cron's auto-tick (every 5min) and the
 * "I want to test this now" workflow. Two buttons:
 *   - "Run tick" calls /api/cron/phase5-tick with the operator secret
 *   - "Run signer" calls /api/cron/phase5-signer
 * The JSON response is displayed so the operator can see what just
 * happened, and a list of recent phase5_executions rows shows the
 * resulting audit trail.
 *
 * This is NOT a replacement for the Vercel cron — it's a debug surface.
 * The Vercel cron continues running on its own schedule.
 */

interface CronResponse {
  ok: boolean;
  [key: string]: unknown;
}

interface ExecutionRow {
  execution_id: string;
  intent_kind: string;
  intent_id: string;
  mode: string;
  status: string;
  signature: string | null;
  error_message: string | null;
  created_at: string;
}

export default function AdminCronPage() {
  const [secret, setSecret] = useState("");
  const [tickResult, setTickResult] = useState<CronResponse | null>(null);
  const [signerResult, setSignerResult] = useState<CronResponse | null>(null);
  const [recent, setRecent] = useState<ExecutionRow[]>([]);
  const [busy, setBusy] = useState<"tick" | "signer" | "recent" | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem("settle:cron-secret");
    if (stored) setSecret(stored);
  }, []);

  async function fire(kind: "tick" | "signer") {
    if (!secret) return toast.error("Paste the secret first.");
    setBusy(kind);
    sessionStorage.setItem("settle:cron-secret", secret);
    try {
      const r = await fetch(`/api/cron/phase5-${kind}`, {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (r.status === 401) {
        toast.error("Secret rejected");
        return;
      }
      const j = (await r.json()) as CronResponse;
      if (kind === "tick") setTickResult(j);
      else setSignerResult(j);
      if (j.ok) {
        toast.success(`${kind} ran. Check the JSON below for counts.`);
      } else {
        toast.error(`${kind} returned errors. Check the JSON.`);
      }
      // Auto-refresh recent after a fire so the audit list shows new rows.
      void loadRecent();
    } catch (e) {
      toast.error(`${kind} failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function loadRecent() {
    if (!secret) return;
    setBusy("recent");
    try {
      // We reuse phase5-signer's own endpoint — it returns counts but
      // not the rows. So we hit the audit endpoint instead, which is
      // public-shape data anyway.
      // Specifically: /api/audit/phase5 needs a wallet param. For
      // operator view we want EVERY recent execution. Workaround: use
      // a direct query to the supabase REST API isn't appropriate from
      // the browser; instead, expose recent exec IDs via the existing
      // /api/admin/federation/origins-style pattern. For v0, we just
      // reload via a small dedicated endpoint we add inline below.
      const r = await fetch("/api/admin/cron/recent", {
        headers: { Authorization: `Bearer ${secret}` },
      });
      if (!r.ok) return;
      const j = (await r.json()) as { rows: ExecutionRow[] };
      setRecent(j.rows ?? []);
    } finally {
      setBusy(null);
    }
  }

  return (
    <W6AppShell forceSurface="operator">
      <div style={{ maxWidth: 880 }}>
        <header style={{ marginBottom: 32 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Operator · cron
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Cron debug
          </h1>
          <p
            className="w6-muted"
            style={{
              fontSize: 14,
              marginTop: 8,
              maxWidth: 640,
              lineHeight: 1.5,
            }}
          >
            Fire the Phase 5 cron endpoints on demand + see recent
            executions. The Vercel cron keeps running on its own schedule
            independent of this page.
          </p>
        </header>

        <section className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-50 p-4">
          <p className="text-[11px] uppercase tracking-wide text-amber-700/70">
            CRON_SECRET
          </p>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Paste the operator secret"
            className="mt-2 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 font-mono text-sm"
          />
        </section>

        <section className="mb-6 grid gap-3 sm:grid-cols-2">
          <CronCard
            title="Phase 5 tick"
            description="Reads scheduled/refill/gift state, advances next_fire_at, marks expirations, sets claim_request_id."
            running={busy === "tick"}
            onFire={() => fire("tick")}
            result={tickResult}
          />
          <CronCard
            title="Phase 5 signer"
            description="Reads the queue from tick, validates card delegation + Pact state, fires spend_via_pact, writes audit rows."
            running={busy === "signer"}
            onFire={() => fire("signer")}
            result={signerResult}
          />
        </section>

        <section>
          <header className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-medium">Recent executions</h2>
            <button
              onClick={loadRecent}
              disabled={!secret || busy === "recent"}
              className="rounded-full border border-[#a1a1aa] px-3 py-1 text-[11px] hover:bg-[#f4f4f5] disabled:opacity-50"
            >
              {busy === "recent" ? "Loading…" : "Refresh"}
            </button>
          </header>
          {recent.length === 0 ? (
            <p className="text-xs text-[#71717a]">
              No rows loaded. Click Refresh.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {recent.map((r) => (
                <li
                  key={r.execution_id}
                  className={`rounded-lg border p-3 text-xs ${statusTone(r.status)}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <strong>{r.intent_kind}</strong>
                    <span className="text-[10px] uppercase tracking-wide opacity-60">
                      {r.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] opacity-70">
                    {r.mode} · {new Date(r.created_at).toLocaleString()}
                  </p>
                  {r.error_message && (
                    <p className="mt-2 rounded bg-red-400/10 p-2 text-[10px] text-red-200/80">
                      {r.error_message}
                    </p>
                  )}
                  {r.signature && (
                    <a
                      href={getSolscanUrl(r.signature)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-[11px] text-accent hover:underline"
                    >
                      Solscan ↗
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </W6AppShell>
  );
}

function statusTone(status: string): string {
  switch (status) {
    case "confirmed":
      return "border-emerald-400/30 bg-emerald-50 text-emerald-700";
    case "sent":
      return "border-amber-400/30 bg-amber-50 text-amber-700";
    case "failed":
      return "border-red-400/30 bg-red-400/[0.04] text-red-100";
    case "dry_run_logged":
    default:
      return "border-[#e4e4e7] bg-[#fafafa] text-[#27272a]";
  }
}

function CronCard({
  title,
  description,
  running,
  onFire,
  result,
}: {
  title: string;
  description: string;
  running: boolean;
  onFire: () => void;
  result: CronResponse | null;
}) {
  return (
    <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 text-[11px] text-[#52525b]">{description}</p>
      <button
        onClick={onFire}
        disabled={running}
        className="mt-3 w6-btn w6-btn-primary disabled:opacity-50"
      >
        {running ? "Running…" : "Run now"}
      </button>
      {result && (
        <pre className="mt-3 max-h-60 overflow-auto rounded-lg border border-[#e4e4e7] bg-[#fafafa] p-3 text-[10px] text-[#27272a]">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
