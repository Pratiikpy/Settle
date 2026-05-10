/**
 * /admin/health — operator dashboard.
 *
 * Single pane of glass for "is Phase 5 alive right now?" Reads
 * directly from Supabase server-side (no client-side wallet auth):
 *
 *   - Last 20 phase5_executions rows (status + intent_kind + age)
 *   - Tail of execution failures in the last 24h
 *   - Indexer lag (latest receipts.created_at vs now)
 *   - Migration count (catches rolled-back deploys)
 *
 * Deliberately bare: no charts, no auto-refresh — load it, read it,
 * gone. The Sentry alerts catch live problems; this page is for
 * "let me eyeball it once after a deploy."
 */
import { Fragment } from "react";
import { createClient } from "@supabase/supabase-js";
import { W6AppShell } from "../../../components/w6-app-shell";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExecRow {
  execution_id: string;
  intent_kind: string;
  status: string;
  signature: string | null;
  error_message: string | null;
  created_at: string;
}

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function ageSeconds(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
}

function fmtAge(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default async function AdminHealthPage({
  searchParams,
}: {
  searchParams?: Promise<{ key?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || params.key !== cronSecret) {
    return (
      <W6AppShell forceSurface="operator">
        <div style={{ maxWidth: 720 }}>
          <h1 className="w6-heading" style={{ fontSize: 32, margin: 0 }}>
            Not found
          </h1>
          <p className="w6-muted" style={{ marginTop: 8, fontSize: 14 }}>
            The page you requested does not exist on this deployment.
          </p>
        </div>
      </W6AppShell>
    );
  }
  const sb = getSb();
  if (!sb) {
    return (
      <W6AppShell forceSurface="operator">
        <div style={{ maxWidth: 720 }}>
          <h1
            className="w6-heading"
            style={{ fontSize: 32, margin: 0 }}
          >
            ⚠ Supabase unconfigured
          </h1>
          <p
            className="w6-muted"
            style={{ marginTop: 8, fontSize: 14 }}
          >
            Set <code>SUPABASE_URL</code> +{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code> in env.
          </p>
        </div>
      </W6AppShell>
    );
  }

  const since24h = new Date(Date.now() - 86400_000).toISOString();

  const [
    { data: recentExecs },
    { data: failures },
    { data: latestReceipt },
    { data: migrationCount },
  ] = await Promise.all([
    sb
      .from("phase5_executions")
      .select("execution_id, intent_kind, status, signature, error_message, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    sb
      .from("phase5_executions")
      .select("execution_id, intent_kind, status, error_message, created_at")
      .eq("status", "failed")
      .gte("created_at", since24h)
      .order("created_at", { ascending: false })
      .limit(10),
    sb
      .from("receipts")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb
      .from("phase5_executions")
      .select("*", { count: "exact", head: true }),
  ]);

  const indexerLagSeconds = latestReceipt?.created_at
    ? ageSeconds(latestReceipt.created_at)
    : null;
  const totalExecs = (migrationCount as { count?: number } | null)?.count ?? null;

  // Aggregate by status for the last-20 view.
  const counts: Record<string, number> = {};
  for (const r of (recentExecs ?? []) as ExecRow[]) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  const isHealthy =
    (counts.confirmed ?? 0) > 0 ||
    ((failures?.length ?? 0) === 0 && (recentExecs?.length ?? 0) > 0);

  return (
    <W6AppShell forceSurface="operator">
      <div className="font-mono" style={{ maxWidth: 880 }}>
      <header className="flex items-baseline justify-between">
        <h1 className="w6-heading" style={{ fontSize: 28, margin: 0 }}>phase5 health</h1>
        <span
          className={`rounded-full px-3 py-1 text-xs ${
            isHealthy
              ? "bg-emerald-400/10 text-emerald-700"
              : "bg-amber-400/10 text-amber-700"
          }`}
        >
          {isHealthy ? "● healthy" : "○ check failures"}
        </span>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="last 20 status" value={Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(" ") || "—"} />
        <Stat label="failures (24h)" value={String(failures?.length ?? 0)} ok={failures?.length === 0} />
        <Stat
          label="indexer lag"
          value={indexerLagSeconds !== null ? fmtAge(indexerLagSeconds) : "no receipts"}
          ok={indexerLagSeconds !== null && indexerLagSeconds < 300}
        />
        <Stat label="total executions" value={String(totalExecs ?? "?")} />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-[#27272a]">last 20 executions</h2>
        <table className="mt-2 w-full text-xs">
          <thead className="text-[#52525b]">
            <tr>
              <th className="text-left font-normal">age</th>
              <th className="text-left font-normal">intent</th>
              <th className="text-left font-normal">status</th>
              <th className="text-left font-normal">sig</th>
            </tr>
          </thead>
          <tbody>
            {(recentExecs ?? []).map((r) => {
              const ok = r.status === "confirmed" || r.status === "sent";
              const showWhy = !ok && r.error_message;
              return (
                <Fragment key={r.execution_id}>
                  <tr className="border-t border-[#f4f4f5]">
                    <td className="py-1 text-[#52525b]">{fmtAge(ageSeconds(r.created_at))}</td>
                    <td className="py-1">{r.intent_kind}</td>
                    <td className={`py-1 ${ok ? "text-emerald-700" : "text-amber-700"}`}>
                      {r.status}
                    </td>
                    <td className="py-1 text-[#71717a]">
                      {r.signature ? `${r.signature.slice(0, 8)}…${r.signature.slice(-4)}` : "—"}
                    </td>
                  </tr>
                  {showWhy && (
                    <tr>
                      <td />
                      <td colSpan={3} className="pb-2 text-[10px] text-amber-700">
                        ↳ {r.error_message}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {!recentExecs?.length && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-[#71717a]">
                  no executions yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {failures && failures.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-amber-700">failures last 24h</h2>
          <ul className="mt-2 space-y-2 text-xs">
            {failures.map((f) => (
              <li key={f.execution_id} className="rounded border border-amber-400/20 bg-amber-50 p-2">
                <div className="flex justify-between">
                  <span className="text-[#52525b]">
                    {f.intent_kind} · {fmtAge(ageSeconds(f.created_at))} ago
                  </span>
                </div>
                <div className="mt-1 text-amber-700">{f.error_message ?? "(no error message)"}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-12 border-t border-[#f4f4f5] pt-4 text-[10px] text-[#71717a]">
        Server-rendered at {new Date().toISOString()}. Refresh for fresh data.
      </footer>
      </div>
    </W6AppShell>
  );
}

function Stat({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="rounded-lg border border-[#e4e4e7] p-3">
      <div className="text-[10px] uppercase tracking-wide text-[#71717a]">{label}</div>
      <div
        className={`mt-1 text-sm ${
          ok === false
            ? "text-amber-700"
            : ok === true
              ? "text-emerald-700"
              : "text-[#09090b]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
