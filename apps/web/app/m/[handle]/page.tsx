import Link from "next/link";
import { notFound } from "next/navigation";
import { W6AppShell } from "../../../components/w6-app-shell";

/**
 * F4.2 — Public merchant profile.
 *
 * Server-rendered. Same /api/merchants/[handle]/profile feed an
 * external client would hit, so the data shape stays identical
 * between server-render and JS-rehydrated views — link previews and
 * search engines see the same numbers a human does.
 */

interface Profile {
  handle: string;
  display_name: string | null;
  pubkey: string;
  capability_verified: boolean;
  capability_alias: string | null;
  n_receipts: number;
  n_unique_payers: number;
  total_revenue_lamports: string;
  n_disputes: number;
  n_disputes_resolved_against: number;
  trust_score: number;
  joined_at: string;
  recent_receipts: Array<{
    request_id: string;
    amount_lamports: string;
    created_at: string;
    decision: string | null;
  }>;
  embed: { pay_button: string; verify_button: string };
}

async function fetchProfile(handle: string): Promise<Profile | null> {
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/merchants/${handle}/profile`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const j = await res.json();
  return j.profile as Profile;
}

function formatUsdc(lamportsStr: string): string {
  const n = BigInt(lamportsStr);
  const whole = (n / 1_000_000n).toString();
  const cents = (n % 1_000_000n).toString().padStart(6, "0").slice(0, 2);
  return `$${whole}.${cents}`;
}

function trustLabel(score: number): { label: string; tone: string } {
  if (score >= 0.99) return { label: "Excellent", tone: "ok" };
  if (score >= 0.95) return { label: "Strong", tone: "ok" };
  if (score >= 0.85) return { label: "Good", tone: "neutral" };
  if (score >= 0.5) return { label: "Mixed", tone: "warn" };
  return { label: "Weak", tone: "warn" };
}

export default async function MerchantProfile({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const profile = await fetchProfile(handle);
  if (!profile) notFound();

  const trust = trustLabel(profile.trust_score);
  const trustColor =
    trust.tone === "ok"
      ? "#10b981"
      : trust.tone === "warn"
        ? "#f59e0b"
        : "var(--w6-ink-2)";

  return (
    <W6AppShell forceSurface="merchant">
      <div style={{ maxWidth: 880 }}>
        {/* Hero */}
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 24,
            marginBottom: 32,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="w6-eyebrow" style={{ fontSize: 12 }}>
              Merchant
            </div>
            <h1
              className="w6-heading"
              style={{
                fontSize: 36,
                margin: "8px 0 0",
                lineHeight: 1.1,
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              @{profile.handle}
              {profile.capability_verified && (
                <span
                  title={`Verified capability: ${profile.capability_alias}`}
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "rgba(16, 185, 129, 0.1)",
                    color: "#10b981",
                  }}
                >
                  ✓ verified
                </span>
              )}
            </h1>
            {profile.display_name && (
              <p
                className="w6-muted"
                style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5 }}
              >
                {profile.display_name}
              </p>
            )}
          </div>
          <div data-testid="merchant-trust-badge" style={{ textAlign: "right" }}>
            <div className="w6-eyebrow" style={{ fontSize: 11 }}>
              Trust
            </div>
            <div
              className="w6-heading"
              style={{
                fontSize: 32,
                marginTop: 4,
                fontVariantNumeric: "tabular-nums",
                color: trustColor,
              }}
            >
              {(profile.trust_score * 100).toFixed(0)}
              <span
                className="w6-muted"
                style={{ fontSize: 16, marginLeft: 4 }}
              >
                /100
              </span>
            </div>
            <div style={{ fontSize: 12, color: trustColor }}>{trust.label}</div>
          </div>
        </header>

        {/* Stats grid */}
        <section
          data-testid="merchant-trust-stats"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <Stat label="Receipts" value={profile.n_receipts.toLocaleString()} />
          <Stat
            label="Unique payers"
            value={profile.n_unique_payers.toLocaleString()}
          />
          <Stat
            label="Total received"
            value={formatUsdc(profile.total_revenue_lamports)}
          />
          <Stat
            label="Disputes"
            value={`${profile.n_disputes_resolved_against} / ${profile.n_disputes}`}
          />
        </section>

        {/* Pubkey card */}
        <section className="w6-card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="w6-eyebrow" style={{ fontSize: 11 }}>
            Pubkey
          </div>
          <code
            style={{
              marginTop: 6,
              display: "block",
              wordBreak: "break-all",
              fontSize: 12,
              fontFamily: "var(--font-w6-mono), monospace",
              color: "var(--w6-ink-2)",
            }}
          >
            {profile.pubkey}
          </code>
          <p
            className="w6-muted"
            style={{ marginTop: 8, fontSize: 11 }}
          >
            Joined {new Date(profile.joined_at).toLocaleDateString()}
          </p>
        </section>

        {/* Recent activity */}
        <section className="w6-card" style={{ padding: 20, marginBottom: 16 }}>
          <h2
            className="w6-heading"
            style={{ fontSize: 16, margin: 0, marginBottom: 12 }}
          >
            Recent activity
          </h2>
          {profile.recent_receipts.length === 0 ? (
            <p className="w6-muted" style={{ fontSize: 13 }}>
              No receipts yet — be their first customer.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {profile.recent_receipts.map((r, i) => (
                <li
                  key={r.request_id}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    padding: "10px 0",
                    borderTop:
                      i === 0 ? "none" : "1px solid var(--w6-rule)",
                    fontSize: 13,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  <Link
                    href={`/r/${r.request_id}`}
                    style={{
                      color: "var(--w6-ink)",
                      textDecoration: "none",
                    }}
                  >
                    <strong>{formatUsdc(r.amount_lamports)}</strong>{" "}
                    <span className="w6-muted" style={{ fontSize: 11 }}>
                      · {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </Link>
                  <span className="w6-muted" style={{ fontSize: 11 }}>
                    {r.decision ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Embed snippets */}
        <section className="w6-card" style={{ padding: 20, marginBottom: 24 }}>
          <h2
            className="w6-heading"
            style={{ fontSize: 16, margin: 0, marginBottom: 4 }}
          >
            Embed on your site
          </h2>
          <p className="w6-muted" style={{ fontSize: 12, marginBottom: 16 }}>
            Drop these tags into your HTML to accept Settle payments and verify
            receipts. They render verifiable widgets without a wallet adapter.
          </p>
          <div style={{ marginBottom: 16 }}>
            <div className="w6-eyebrow" style={{ fontSize: 11 }}>
              Accept payment
            </div>
            <pre
              style={{
                marginTop: 6,
                padding: 12,
                borderRadius: 8,
                background: "var(--w6-bg-2)",
                border: "1px solid var(--w6-rule)",
                overflow: "auto",
                fontSize: 11,
                fontFamily: "var(--font-w6-mono), monospace",
                color: "var(--w6-ink-2)",
              }}
            >
              {profile.embed.pay_button}
            </pre>
          </div>
          <div>
            <div className="w6-eyebrow" style={{ fontSize: 11 }}>
              Verify a receipt
            </div>
            <pre
              style={{
                marginTop: 6,
                padding: 12,
                borderRadius: 8,
                background: "var(--w6-bg-2)",
                border: "1px solid var(--w6-rule)",
                overflow: "auto",
                fontSize: 11,
                fontFamily: "var(--font-w6-mono), monospace",
                color: "var(--w6-ink-2)",
              }}
            >
              {profile.embed.verify_button}
            </pre>
          </div>
        </section>

        <nav style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            href={`/m/${profile.handle}/analytics`}
            className="w6-btn w6-btn-secondary w6-btn-sm"
          >
            Analytics →
          </Link>
          <Link
            href={`/m/${profile.handle}/disputes`}
            className="w6-btn w6-btn-secondary w6-btn-sm"
          >
            Disputes →
          </Link>
        </nav>
      </div>
    </W6AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="w6-card" style={{ padding: 16 }}>
      <div className="w6-eyebrow" style={{ fontSize: 11 }}>
        {label}
      </div>
      <div
        className="w6-heading"
        style={{
          fontSize: 18,
          marginTop: 6,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
}
