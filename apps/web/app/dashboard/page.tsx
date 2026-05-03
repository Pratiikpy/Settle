"use client";

/**
 * Wave 6.2 — Consumer home (`/dashboard`).
 *
 * Bento layout per WAVE_6_PAGE_SPECS §2. Single round-trip to
 * `/api/dashboard/v6` then renders all cells from one payload. Empty
 * wallet renders empty states for each cell rather than zeros — see
 * WAVE_6_REDESIGN_PLAN cross-cutting empty-state strategy.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  W6BentoCard,
  W6BentoGrid,
  W6Pill,
  W6Spark,
} from "@settle/ui";
import { W6AppShell } from "../../components/w6-app-shell";

interface DashboardData {
  ok: true;
  pubkey: string;
  today: {
    spent_usdc: string;
    spent_count: number;
    received_usdc: string;
    received_count: number;
    agents_active: number;
  };
  agents_on_duty: Array<{
    card_pubkey: string;
    label: string;
    spent_today_usdc: string;
    cap_usdc: string;
    fill_pct: number;
  }>;
  recent_receipts: Array<{
    request_id: string;
    kind: string;
    counterparty: string;
    purpose: string;
    amount_usdc: string;
    decision: string;
    deny_code: number | null;
    ts: string;
  }>;
  active_pacts: Array<{
    pact_pubkey: string;
    kind: string;
    label: string;
    spent_usdc: string;
    cap_usdc: string;
    expiry_slot: string | null;
    fill_pct: number;
  }>;
  coming_up: Array<{
    kind: string;
    label: string;
    cadence: string;
    next_run: string | null;
    amount_usdc: string;
  }>;
  savings: Array<{
    id: string;
    label: string;
    saved_usdc: string;
    goal_usdc: string;
    fill_pct: number;
  }>;
}

interface BalanceData {
  usdc: string;
  sol: string;
  cluster: string;
}

export default function DashboardPage() {
  const { publicKey, connected } = useWallet();
  const [data, setData] = useState<DashboardData | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [handle, setHandle] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) return;
    let cancelled = false;
    const pk = publicKey.toBase58();
    setLoading(true);
    setError(false);
    fetch(`/api/dashboard/v6?pubkey=${encodeURIComponent(pk)}`)
      .then((r) => r.json())
      .then((j: DashboardData) => {
        if (!cancelled) setData(j);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    fetch(`/api/handles/by-pubkey?pubkey=${encodeURIComponent(pk)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { handle?: string } | null) => {
        if (!cancelled && j?.handle) setHandle(j.handle);
      })
      .catch(() => {
        /* ignore — handle is decorative */
      });
    fetch(`/api/balance?pubkey=${encodeURIComponent(pk)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { usdc?: string; sol?: string; cluster?: string } | null) => {
        if (!cancelled && j) {
          setBalance({
            usdc: j.usdc ?? "0.00",
            sol: j.sol ?? "0.00",
            cluster: j.cluster ?? "devnet",
          });
        }
      })
      .catch(() => {
        /* balance is best-effort — RPC may be down */
      });
    return () => {
      cancelled = true;
    };
  }, [connected, publicKey]);

  if (!connected) {
    return (
      <W6AppShell>
        <div style={{ maxWidth: 640, margin: "80px auto", textAlign: "center" }}>
          <h1 className="w6-heading" style={{ fontSize: 36, lineHeight: 1.1 }}>
            Connect a wallet to see your dashboard.
          </h1>
          <p className="w6-muted" style={{ marginTop: 16, fontSize: 16 }}>
            Settle is self-custody. Nothing happens without your signature.
          </p>
        </div>
      </W6AppShell>
    );
  }

  return (
    <W6AppShell>
      <Hero handle={handle} />
      <BalanceStrip balance={balance} />
      <BentoTodayAgents data={data} loading={loading} error={error} />
      <RecentReceipts data={data} loading={loading} />
      <BentoPactsAndUpcoming data={data} loading={loading} />
      <ProtocolFooter />
    </W6AppShell>
  );
}

/* ============================================================ */

function Hero({ handle }: { handle: string | null }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 24,
        marginBottom: 28,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 280 }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>
          {handle ? `Hi @${handle}` : "Welcome"}
        </div>
        <h1
          className="w6-heading"
          style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.1 }}
        >
          Move money. Trust the receipt.
        </h1>
        <p
          className="w6-muted"
          style={{ fontSize: 14, marginTop: 8, maxWidth: 640, lineHeight: 1.5 }}
        >
          Pay anyone, fund a Pact, or check what your agents did today. Every
          line below resolves to a verifiable on-chain receipt.
        </p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Link href="/ledger" className="w6-btn w6-btn-secondary w6-btn-sm">
          All receipts
        </Link>
        <Link href="/send" className="w6-btn w6-btn-primary w6-btn-sm">
          Send →
        </Link>
      </div>
    </div>
  );
}

function BalanceStrip({ balance }: { balance: BalanceData | null }) {
  const cluster = balance?.cluster ?? "devnet";
  return (
    <div className="w6-strip" style={{ marginBottom: 28 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 32,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <div
            className="w6-eyebrow"
            style={{ color: "rgba(255,255,255,0.55)", marginBottom: 10 }}
          >
            Available · USDC
          </div>
          <div
            className="w6-heading"
            style={{ fontSize: 64, lineHeight: 0.95, color: "#fff" }}
          >
            {balance ? `$${balance.usdc}` : "—"}
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.6)",
              fontSize: 13,
              marginTop: 8,
            }}
          >
            {balance ? balance.sol : "—"} SOL · {cluster}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link
            href="/send"
            className="w6-btn w6-btn-onstrip w6-btn-sm"
            style={{ height: 36, padding: "0 16px" }}
          >
            Send
          </Link>
          <Link
            href="/wishes"
            className="w6-btn w6-btn-onstrip-ghost w6-btn-sm"
            style={{ height: 36, padding: "0 16px" }}
          >
            Save
          </Link>
          <Link
            href="/cards/new"
            className="w6-btn w6-btn-onstrip-ghost w6-btn-sm"
            style={{ height: 36, padding: "0 16px" }}
          >
            Open Pact
          </Link>
          <Link
            href="/verify"
            className="w6-btn w6-btn-onstrip-ghost w6-btn-sm"
            style={{ height: 36, padding: "0 16px" }}
          >
            Verify a receipt
          </Link>
        </div>
      </div>
    </div>
  );
}

function BentoTodayAgents({
  data,
  loading,
  error,
}: {
  data: DashboardData | null;
  loading: boolean;
  error: boolean;
}) {
  if (error) {
    return (
      <W6BentoCard style={{ marginBottom: 28 }}>
        <p style={{ margin: 0 }}>
          Couldn&apos;t load dashboard data. Reload to retry.
        </p>
      </W6BentoCard>
    );
  }
  return (
    <div style={{ marginBottom: 28 }}>
      <W6BentoGrid>
        {/* Today */}
        <W6BentoCard span={2}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 16,
              gap: 12,
            }}
          >
            <span className="w6-eyebrow" style={{ flex: 1 }}>
              Today
            </span>
            <Link
              href="/ledger"
              className="w6-btn w6-btn-ghost w6-btn-sm"
              style={{ height: 24, padding: "0 8px" }}
            >
              See all
            </Link>
          </div>
          <div
            style={{
              display: "flex",
              gap: 24,
              marginBottom: 18,
              flexWrap: "wrap",
            }}
          >
            <TodayStat
              loading={loading}
              big={data ? `$${data.today.spent_usdc}` : "—"}
              small={data ? `spent · ${data.today.spent_count} receipts` : ""}
            />
            <TodayStat
              loading={loading}
              big={data ? `$${data.today.received_usdc}` : "—"}
              small={data ? `received · ${data.today.received_count} receipts` : ""}
            />
            <TodayStat
              loading={loading}
              big={data ? String(data.today.agents_active) : "—"}
              small={data ? "agents active" : ""}
            />
          </div>
          <W6Spark
            label="Receipts today"
            values={
              data
                ? [
                    data.today.spent_count,
                    data.today.received_count,
                    Math.max(data.today.agents_active, 1),
                  ]
                : [0]
            }
            height={48}
          />
        </W6BentoCard>

        {/* Agents on duty */}
        <W6BentoCard span={2}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 16,
              gap: 12,
            }}
          >
            <span className="w6-eyebrow" style={{ flex: 1 }}>
              Agents on duty
            </span>
            <Link
              href="/cards"
              className="w6-btn w6-btn-ghost w6-btn-sm"
              style={{ height: 24, padding: "0 8px" }}
            >
              Manage
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {loading && !data ? (
              <>
                <AgentRowSkel />
                <AgentRowSkel />
                <AgentRowSkel />
              </>
            ) : data && data.agents_on_duty.length > 0 ? (
              data.agents_on_duty.map((a) => (
                <AgentRow
                  key={a.card_pubkey}
                  label={a.label}
                  spent={a.spent_today_usdc}
                  cap={a.cap_usdc}
                  fill={a.fill_pct}
                />
              ))
            ) : (
              <Link
                href="/agents"
                className="w6-muted"
                style={{ fontSize: 13, lineHeight: 1.6 }}
              >
                No agents yet. AgentCards turn AI workflows into bounded
                spend. <strong>Hire your first agent →</strong>
              </Link>
            )}
          </div>
        </W6BentoCard>
      </W6BentoGrid>
    </div>
  );
}

function TodayStat({
  big,
  small,
  loading,
}: {
  big: string;
  small: string;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div>
        <div className="w6-skel" style={{ width: 96, height: 32 }} />
        <div
          className="w6-skel"
          style={{ width: 120, height: 12, marginTop: 6 }}
        />
      </div>
    );
  }
  return (
    <div>
      <div className="w6-heading" style={{ fontSize: 32, lineHeight: 1 }}>
        {big}
      </div>
      <div className="w6-micro" style={{ marginTop: 4 }}>
        {small}
      </div>
    </div>
  );
}

function AgentRow({
  label,
  spent,
  cap,
  fill,
}: {
  label: string;
  spent: string;
  cap: string;
  fill: number;
}) {
  const initial = (label[0] ?? "?").toUpperCase();
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "var(--w6-ink)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13.4,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {initial}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
          <div className="w6-mono" style={{ fontSize: 11.5 }}>
            ${spent} / ${cap}
          </div>
        </div>
        <div
          style={{
            height: 4,
            background: "var(--w6-rule-2)",
            borderRadius: 999,
            marginTop: 6,
            overflow: "hidden",
          }}
          role="progressbar"
          aria-valuenow={fill}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            style={{
              width: `${fill}%`,
              height: "100%",
              background: "var(--w6-ink)",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function AgentRowSkel() {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div className="w6-skel" style={{ width: 32, height: 32, borderRadius: "50%" }} />
      <div style={{ flex: 1 }}>
        <div className="w6-skel" style={{ width: "80%", height: 14 }} />
        <div
          className="w6-skel"
          style={{ width: "100%", height: 4, marginTop: 8 }}
        />
      </div>
    </div>
  );
}

function RecentReceipts({
  data,
  loading,
}: {
  data: DashboardData | null;
  loading: boolean;
}) {
  return (
    <div
      className="w6-card-flat"
      style={{ marginBottom: 28, overflow: "hidden" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "20px 24px",
          borderBottom: "1px solid var(--w6-rule)",
          gap: 12,
        }}
      >
        <span className="w6-eyebrow" style={{ flex: 1 }}>
          Recent receipts
        </span>
        <Link
          href="/ledger"
          className="w6-btn w6-btn-ghost w6-btn-sm"
        >
          All →
        </Link>
      </div>
      {loading && !data ? (
        <div style={{ padding: 24 }}>
          <div className="w6-skel" style={{ height: 14, marginBottom: 8 }} />
          <div className="w6-skel" style={{ height: 14, marginBottom: 8 }} />
          <div className="w6-skel" style={{ height: 14 }} />
        </div>
      ) : data && data.recent_receipts.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table className="w6-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Kind</th>
                <th>Counterparty</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_receipts.map((r) => (
                <tr key={r.request_id}>
                  <td className="w6-mono" style={{ fontSize: 12 }}>
                    <Link href={`/receipts/${r.request_id}`}>
                      R-{r.request_id.slice(0, 8).toUpperCase()}
                    </Link>
                  </td>
                  <td>
                    <W6Pill tone="mono">{r.kind.replace(/_/g, " ")}</W6Pill>
                  </td>
                  <td>{r.counterparty}</td>
                  <td style={{ textAlign: "right", fontWeight: 500 }}>
                    {r.decision === "DENY" ? "" : "−"}${r.amount_usdc}
                  </td>
                  <td>
                    {r.decision === "ALLOW" ? (
                      <W6Pill tone="ok">confirmed</W6Pill>
                    ) : (
                      <W6Pill tone="bad">denied</W6Pill>
                    )}
                  </td>
                  <td className="w6-muted">{r.ts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: 24 }} className="w6-muted">
          No receipts yet.{" "}
          <Link
            href="/send"
            style={{ color: "var(--w6-ink)", fontWeight: 500 }}
          >
            Send to anyone →
          </Link>
        </div>
      )}
    </div>
  );
}

function BentoPactsAndUpcoming({
  data,
  loading,
}: {
  data: DashboardData | null;
  loading: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 1fr",
        gap: 16,
        marginBottom: 28,
      }}
      className="w6-pacts-row"
    >
      <W6BentoCard>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: 16,
            gap: 12,
          }}
        >
          <span className="w6-eyebrow" style={{ flex: 1 }}>
            Active Pacts
          </span>
          <Link href="/cards" className="w6-btn w6-btn-ghost w6-btn-sm">
            All
          </Link>
        </div>
        {loading && !data ? (
          <div className="w6-skel" style={{ height: 100 }} />
        ) : data && data.active_pacts.length > 0 ? (
          <div className="w6-grid-3">
            {data.active_pacts.map((p) => (
              <Link
                key={p.pact_pubkey}
                href={`/cards/${p.pact_pubkey}`}
                className="w6-card w6-card-hover"
                style={{ padding: 20, display: "block" }}
              >
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <W6Pill tone="ok">active</W6Pill>
                  <W6Pill tone="mono">{p.kind}</W6Pill>
                </div>
                <div
                  className="w6-heading"
                  style={{ fontSize: 18, marginBottom: 4 }}
                >
                  {p.label}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 14,
                    marginBottom: 6,
                  }}
                >
                  <span className="w6-micro">spent</span>
                  <span className="w6-mono" style={{ fontSize: 12 }}>
                    ${p.spent_usdc}
                    <span className="w6-muted"> / ${p.cap_usdc}</span>
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: "var(--w6-rule-2)",
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${p.fill_pct}%`,
                      height: "100%",
                      background: "var(--w6-ink)",
                    }}
                  />
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <Link href="/cards/new" className="w6-muted" style={{ fontSize: 13 }}>
            No active Pacts. <strong>Open a Pact →</strong>
          </Link>
        )}
      </W6BentoCard>

      <W6BentoCard>
        <ComingUpAndSavings data={data} loading={loading} />
      </W6BentoCard>

      <style>{`
        @media (max-width: 880px) {
          .w6-pacts-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

function ComingUpAndSavings({
  data,
  loading,
}: {
  data: DashboardData | null;
  loading: boolean;
}) {
  return (
    <>
      <div className="w6-eyebrow" style={{ marginBottom: 12 }}>
        Coming up
      </div>
      {loading && !data ? (
        <div className="w6-skel" style={{ height: 64, marginBottom: 14 }} />
      ) : data && data.coming_up.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.coming_up.map((c, idx) => (
            <div key={idx} style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: "var(--w6-bg-3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: 14 }}>📅</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{c.label}</div>
                <div className="w6-muted" style={{ fontSize: 12 }}>
                  {c.cadence}
                  {c.next_run
                    ? ` · ${new Date(c.next_run).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}`
                    : ""}
                </div>
              </div>
              <div className="w6-mono" style={{ fontSize: 12.5, fontWeight: 500 }}>
                ${c.amount_usdc}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="w6-muted" style={{ fontSize: 13 }}>
          Nothing scheduled.
        </div>
      )}

      <div
        style={{ height: 1, background: "var(--w6-rule)", margin: "14px 0" }}
      />

      <div className="w6-eyebrow" style={{ marginBottom: 12 }}>
        Saving toward
      </div>
      {loading && !data ? (
        <div className="w6-skel" style={{ height: 32 }} />
      ) : data && data.savings.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {data.savings.map((s) => (
            <div key={s.id}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 13 }}>{s.label}</span>
                <span className="w6-mono" style={{ fontSize: 11.5 }}>
                  ${s.saved_usdc} / ${s.goal_usdc}
                </span>
              </div>
              <div
                style={{
                  height: 4,
                  background: "var(--w6-rule-2)",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${s.fill_pct}%`,
                    height: "100%",
                    background: "var(--w6-ink)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="w6-muted" style={{ fontSize: 13 }}>
          No savings goals.
        </div>
      )}
    </>
  );
}

function ProtocolFooter() {
  const items: Array<{ label: string; sub: string }> = [
    { label: "1 · receipt_hash", sub: "Compact identity for the payment record." },
    { label: "2 · reason_hash", sub: "What was paid for, in canonical form." },
    {
      label: "3 · policy_snapshot_hash",
      sub: "Which rules the agent followed at the moment of spend.",
    },
    {
      label: "4 · purpose_hash",
      sub: "Optional buyer-side intent commitment.",
    },
  ];
  return (
    <W6BentoCard style={{ background: "var(--w6-bg)", padding: 32 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 24,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 280 }}>
          <span className="w6-eyebrow">The protocol underneath</span>
          <h2
            className="w6-heading"
            style={{ fontSize: 24, margin: "8px 0 0" }}
          >
            Every payment is a 4-hash commitment.
          </h2>
        </div>
        <Link href="/verify" className="w6-btn w6-btn-secondary w6-btn-sm">
          Try the verifier
        </Link>
      </div>
      <div className="w6-grid-4">
        {items.map((it) => (
          <div key={it.label} className="w6-card-flat" style={{ padding: 16 }}>
            <div className="w6-mono w6-micro" style={{ marginBottom: 8 }}>
              {it.label}
            </div>
            <div className="w6-muted" style={{ fontSize: 12.5 }}>
              {it.sub}
            </div>
          </div>
        ))}
      </div>
    </W6BentoCard>
  );
}
