/**
 * F2.5 — Public proof page `/at/[handle]/proof`.
 *
 * Public read; no auth. Renders verifiable lifetime activity for a
 * handle owner. Hero (name, badges, joined). Three sections:
 *   1. Capability usage breakdown (top capabilities with counts)
 *   2. Public receipts feed (only ALLOW receipts where public_feed=true)
 *   3. Reputation graph (counterparty list, opt-in)
 *
 * Server-rendered. Counts come from `agent_trust_scores` for hot path,
 * `receipts` for itemized view.
 *
 * Wave 1 / Stream C1.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ handle: string }>;
}

function getSb() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtUsdc(lamports: string | number | null): string {
  if (lamports == null) return "—";
  const n = typeof lamports === "string" ? Number(lamports) : lamports;
  return `$${(n / 1e6).toFixed(2)}`;
}

export default async function ProofPage({ params }: PageProps) {
  const { handle } = await params;
  const sb = getSb();
  if (!sb) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="text-xl">⚠ Service unavailable</h1>
        <p className="mt-2 text-sm text-[#52525b]">Supabase not configured.</p>
      </main>
    );
  }

  // Resolve the handle to a pubkey.
  const { data: handleRow } = await sb
    .from("handles")
    .select("pubkey, display_name, avatar_url, created_at, sns_domain")
    .eq("handle", handle)
    .maybeSingle();
  if (!handleRow) {
    notFound();
  }

  const pubkey = handleRow.pubkey as string;

  // Trust score + components.
  const { data: ts } = await sb
    .from("agent_trust_scores")
    .select(
      "score, unique_counterparties, receipts_total, receipts_allowed, receipts_denied, refunds_count, allow_rate, inverse_dispute_rate, tier, last_computed_at",
    )
    .eq("pubkey", pubkey)
    .maybeSingle();

  // Reputation badges.
  const { data: badges } = await sb
    .from("reputation_badges")
    .select("badge_kind, minted_at, asset_pubkey")
    .eq("recipient_pubkey", pubkey);

  // Capability breakdown — top 10 capabilities by receipt count.
  const { data: capRows } = await sb
    .from("receipts")
    .select("capability_hash")
    .eq("merchant_pubkey", pubkey)
    .eq("decision", "ALLOW")
    .not("capability_hash", "is", null)
    .limit(2000);
  const capCounts: Record<string, number> = {};
  for (const r of capRows ?? []) {
    const h = (r.capability_hash as string | null)?.slice(0, 12) ?? "?";
    capCounts[h] = (capCounts[h] ?? 0) + 1;
  }
  const topCaps = Object.entries(capCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // Capability registry alias lookup
  const capAliases: Record<string, string> = {};
  if (topCaps.length > 0) {
    const { data: regRows } = await sb
      .from("capability_registry")
      .select("hash, alias")
      .in(
        "hash",
        topCaps.map(([h]) => h),
      );
    for (const r of regRows ?? []) {
      capAliases[r.hash as string] = r.alias as string;
    }
  }

  // Public-feed receipts (recent 20).
  const { data: publicReceipts } = await sb
    .from("receipts")
    .select(
      "request_id, amount_lamports, decision, capability_hash, narration_text, created_at",
    )
    .eq("merchant_pubkey", pubkey)
    .eq("decision", "ALLOW")
    .eq("public_feed", true)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <main className="mx-auto max-w-3xl p-6 font-sans">
      <header className="border-b border-[#e4e4e7] pb-6">
        <div className="flex items-start gap-4">
          {handleRow.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={handleRow.avatar_url as string}
              alt=""
              className="h-16 w-16 rounded-full"
            />
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">
              {handleRow.display_name || `@${handle}`}
            </h1>
            <p className="text-sm text-[#52525b]">@{handle}</p>
            <p className="mt-1 text-xs text-[#71717a]">
              Joined {fmtDate(handleRow.created_at as string)}
            </p>
          </div>
          {ts && (
            <div className="text-right">
              <div className="text-3xl font-semibold">
                {Math.round((ts.score as number) ?? 0)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-[#52525b]">
                trust score
              </div>
              <div className="mt-1 text-[10px] text-[#52525b]">{ts.tier as string}</div>
            </div>
          )}
        </div>
        {badges && badges.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {badges.map((b) => (
              <span
                key={b.asset_pubkey as string}
                className="rounded-full border border-emerald-400/30 bg-emerald-400/[0.05] px-3 py-1 text-[10px] text-emerald-700"
              >
                {b.badge_kind as string}
              </span>
            ))}
          </div>
        )}
      </header>

      {ts && (
        <section className="mt-6 grid grid-cols-4 gap-3 text-center text-xs">
          <Stat label="payments" value={String(ts.receipts_total ?? 0)} />
          <Stat
            label="counterparties"
            value={String(ts.unique_counterparties ?? 0)}
          />
          <Stat
            label="allow rate"
            value={`${Math.round((ts.allow_rate as number) * 100)}%`}
          />
          <Stat
            label="refunds"
            value={String(ts.refunds_count ?? 0)}
          />
        </section>
      )}

      {ts && (
        <section className="mt-6 rounded-xl border border-[#e4e4e7] bg-[#fafafa] p-4 text-xs leading-relaxed text-[#27272a]">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#52525b]">
            How this number is calculated
          </h2>
          <p className="mt-2">
            Score = <code className="font-mono">100 × (0.4·allow_rate + 0.3·inverse_dispute_rate + 0.2·log10(receipts_allowed+1)/3 + 0.1·log10(unique_counterparties+1)/2)</code>.
            All inputs are kernel-anchored, so the score can&rsquo;t be inflated by self-paid receipts or off-chain claims.
          </p>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            <li>
              <span className="text-[#71717a]">allow rate</span>{" "}
              <strong>{Math.round((ts.allow_rate as number) * 100)}%</strong>
            </li>
            <li>
              <span className="text-[#71717a]">inv. dispute</span>{" "}
              <strong>
                {Math.round(((ts.inverse_dispute_rate as number) ?? 1) * 100)}%
              </strong>
            </li>
            <li>
              <span className="text-[#71717a]">allowed</span>{" "}
              <strong>{String(ts.receipts_allowed ?? 0)}</strong>
            </li>
            <li>
              <span className="text-[#71717a]">denied</span>{" "}
              <strong>{String(ts.receipts_denied ?? 0)}</strong>
            </li>
          </ul>
          <p className="mt-3 text-[10px] text-[#71717a]">
            Updated {fmtDate(ts.last_computed_at as string)}. Tier auto-promotes once
            thresholds clear (bronze → silver → gold → platinum).
          </p>
        </section>
      )}

      {topCaps.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-[#27272a]">
            top capabilities
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {topCaps.map(([hash, count]) => (
              <li
                key={hash}
                className="flex items-center justify-between rounded border border-[#e4e4e7] px-3 py-2"
              >
                <span>
                  {capAliases[hash] || (
                    <code className="font-mono text-xs text-[#52525b]">
                      {hash}…
                    </code>
                  )}
                </span>
                <span className="text-[#52525b]">{count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold text-[#27272a]">
          public receipts ({publicReceipts?.length ?? 0})
        </h2>
        {!publicReceipts?.length && (
          <p className="mt-2 text-xs text-[#71717a]">
            No public receipts yet. (Receipts default to private; opt in per-card.)
          </p>
        )}
        <ul className="mt-2 space-y-2 text-xs">
          {(publicReceipts ?? []).map((r) => (
            <li
              key={r.request_id as string}
              className="rounded border border-[#e4e4e7] p-2"
            >
              <div className="flex justify-between">
                <Link
                  href={`/receipts/${r.request_id}`}
                  className="font-mono text-[#27272a] underline-offset-2 hover:underline"
                >
                  {(r.request_id as string).slice(0, 8)}…
                </Link>
                <span>{fmtUsdc(r.amount_lamports as string)}</span>
                <span className="text-[#71717a]">
                  {fmtDate(r.created_at as string)}
                </span>
              </div>
              {r.narration_text && (
                <p className="mt-1 text-[#52525b]">
                  {(r.narration_text as string).slice(0, 200)}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-12 border-t border-[#e4e4e7] pt-4 text-[10px] text-[#71717a]">
        Public proof page. Anyone can view this without a wallet. Trust
        score recomputes every 5 minutes — last refreshed{" "}
        {ts?.last_computed_at
          ? new Date(ts.last_computed_at as string).toLocaleString()
          : "—"}
        .
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[#e4e4e7] p-2">
      <div className="text-[10px] uppercase tracking-wide text-[#71717a]">
        {label}
      </div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
