"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { W6AppShell } from "../../../../components/w6-app-shell";

/**
 * /m/[handle]/manage — merchant operator landing.
 *
 * Index page that surfaces every merchant-self-serve surface we've
 * built in one place + shows "what's pending you should look at":
 *   - Pending disputes count → /m/[handle]/disputes
 *   - Webhook health (configured? last delivered?) → /m/[handle]/webhook
 *   - Recent capability publishes → /m/[handle]/capabilities
 *   - Receipts + analytics deep links
 *
 * Wallet-gated: only the wallet that owns @handle sees the page. Anyone
 * else gets a polite "you're connected as X, this is Y's manage page"
 * message + link to the public /m/[handle] profile.
 */

interface ProfileShape {
  handle: string;
  pubkey: string;
  display_name: string | null;
  n_receipts: number;
  n_disputes: number;
  n_disputes_resolved_against: number;
  trust_score: number;
}

interface DisputeRow {
  resolution_decision: "pending" | "approved_refund" | "denied";
}

interface WebhookState {
  webhook_configured: boolean;
  webhook_url: string | null;
  last_delivered_at: string | null;
  last_error: string | null;
}

export default function MerchantManagePage() {
  const params = useParams<{ handle: string }>();
  const { connected, publicKey } = useWallet();
  const owner = publicKey?.toBase58() ?? "";

  const [profile, setProfile] = useState<ProfileShape | null>(null);
  const [pendingDisputes, setPendingDisputes] = useState<number | null>(null);
  const [webhook, setWebhook] = useState<WebhookState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!params.handle) return;
    setLoading(true);
    void Promise.all([
      fetch(`/api/merchants/${params.handle}/profile`).then((r) =>
        r.ok ? r.json() : null,
      ),
      fetch(`/api/merchants/${params.handle}/disputes`).then((r) =>
        r.ok ? r.json() : null,
      ),
    ])
      .then(([prof, disp]) => {
        if (prof?.profile) setProfile(prof.profile);
        if (disp?.disputes) {
          const pending = disp.disputes.filter(
            (d: DisputeRow) => d.resolution_decision === "pending",
          ).length;
          setPendingDisputes(pending);
        }
      })
      .finally(() => setLoading(false));
  }, [params.handle]);

  // Webhook state requires wallet auth — fetch only when connected as the merchant.
  useEffect(() => {
    if (!profile || !connected || owner !== profile.pubkey) return;
    // Soft fetch — webhook endpoint requires auth headers via signed
    // challenge. The merchant manage page uses a non-auth GET to the
    // verified_merchants public state via a thin endpoint instead.
    // For now we leave webhook=null; merchant clicks through to the
    // dedicated page for the full state.
    void fetch(`/api/merchants/${params.handle}/profile`)
      .then((r) => (r.ok ? r.json() : null))
      .then(() => setWebhook(null));
  }, [profile, connected, owner, params.handle]);

  const isMerchant = profile && owner === profile.pubkey;

  return (
    <W6AppShell forceSurface="merchant">
      <div style={{ maxWidth: 720 }}>
        <header style={{ marginBottom: 28 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Merchant · settle.so/m/{params.handle}
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            @{params.handle}
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
            Operator surfaces for the merchant who owns this handle.
            Disputes, webhooks, capabilities, receipts — all in one place.
          </p>
        </header>

        {loading ? (
          <p className="text-sm text-[#52525b]">Loading…</p>
        ) : !profile ? (
          <div
            data-testid="manage-handle-unclaimed"
            className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5"
          >
            <h2 className="text-sm font-medium text-[#0a0a0c]">
              @{params.handle} hasn&apos;t been claimed yet.
            </h2>
            <p className="mt-2 text-xs text-[#52525b]">
              Merchant handles are claimed when a wallet first publishes a
              capability or receives a payment under that handle. Once that
              happens, the manage surfaces (disputes, webhook, capabilities,
              analytics) unlock here.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/start/merchant"
                className="rounded-lg border border-[#0a0a0c] bg-[#0a0a0c] px-3 py-1.5 text-xs font-medium text-white"
              >
                Get started as a merchant →
              </Link>
              <Link
                href="/"
                className="rounded-lg border border-[#e4e4e7] bg-white px-3 py-1.5 text-xs font-medium text-[#0a0a0c]"
              >
                Back to home
              </Link>
            </div>
          </div>
        ) : !connected ? (
          <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5 text-sm text-[#52525b]">
            Connect the wallet that owns @{params.handle} to manage. Public
            profile is at{" "}
            <Link href={`/m/${params.handle}`} className="text-accent">
              /m/{params.handle}
            </Link>
            .
          </div>
        ) : !isMerchant ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-4 text-xs text-amber-200">
            You&apos;re connected as{" "}
            <code className="font-mono">
              {owner.slice(0, 6)}…{owner.slice(-4)}
            </code>
            , but @{params.handle} resolves to{" "}
            <code className="font-mono">
              {profile.pubkey.slice(0, 6)}…{profile.pubkey.slice(-4)}
            </code>
            . Switch wallets to manage. Public profile is at{" "}
            <Link
              href={`/m/${params.handle}`}
              className="underline hover:text-amber-100"
            >
              /m/{params.handle}
            </Link>
            .
          </div>
        ) : (
          <>
            {/* Top stats */}
            <section className="mb-6 grid grid-cols-3 gap-2">
              <Stat
                label="Receipts"
                value={profile.n_receipts.toLocaleString()}
              />
              <Stat
                label="Trust"
                value={`${(profile.trust_score * 100).toFixed(0)}/100`}
                tone={
                  profile.trust_score >= 0.95
                    ? "emerald"
                    : profile.trust_score >= 0.5
                      ? "amber"
                      : "red"
                }
              />
              <Stat
                label="Pending disputes"
                value={
                  pendingDisputes === null
                    ? "—"
                    : pendingDisputes.toLocaleString()
                }
                tone={
                  pendingDisputes && pendingDisputes > 0 ? "amber" : "emerald"
                }
              />
            </section>

            {/* Pending action banner */}
            {pendingDisputes && pendingDisputes > 0 ? (
              <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-4 text-xs">
                <p className="text-amber-200">
                  ⚠ {pendingDisputes} dispute{pendingDisputes === 1 ? "" : "s"}{" "}
                  awaiting your response.
                </p>
                <Link
                  href={`/m/${params.handle}/disputes`}
                  className="mt-2 inline-block text-amber-100 underline hover:text-amber-50"
                >
                  Resolve now →
                </Link>
              </div>
            ) : null}

            {/* Manage cards */}
            <section className="mb-6 grid gap-3 sm:grid-cols-2">
              <ManageCard
                href={`/m/${params.handle}/disputes`}
                title="Disputes"
                description="Resolve refund requests with AI draft + on-chain refund."
                badge={
                  pendingDisputes && pendingDisputes > 0
                    ? `${pendingDisputes} pending`
                    : null
                }
                badgeTone="amber"
              />
              <ManageCard
                href={`/m/${params.handle}/webhook`}
                title="Webhook"
                description="Register your URL + signing secret for real-time receipt events."
                badge={webhook?.webhook_configured ? "active" : "configure"}
                badgeTone={webhook?.webhook_configured ? "emerald" : "amber"}
              />
              <ManageCard
                href={`/m/${params.handle}/capabilities`}
                title="Capabilities"
                description="Publish your tool spec → cap hash so users can pin allowlists."
                badge={null}
                badgeTone="neutral"
              />
              <ManageCard
                href={`/m/${params.handle}/analytics`}
                title="Analytics"
                description="Receipts over time, top customers, daily/weekly revenue."
                badge={null}
                badgeTone="neutral"
              />
            </section>

            {/* Reference */}
            <section className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
              <h2 className="text-sm font-medium">Public profile</h2>
              <p className="mt-2 text-xs text-[#52525b]">
                Customers see{" "}
                <Link
                  href={`/m/${params.handle}`}
                  className="text-accent hover:underline"
                >
                  /m/{params.handle}
                </Link>{" "}
                — your trust score, recent receipts, and embed snippets for
                the Settle Pay button.
              </p>
            </section>
          </>
        )}
      </div>
    </W6AppShell>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "emerald" | "amber" | "red";
}) {
  const cls = {
    neutral: "border-[#e4e4e7] text-[#27272a]",
    emerald: "border-emerald-400/30 text-emerald-200",
    amber: "border-amber-400/30 text-amber-200",
    red: "border-red-400/30 text-red-200",
  }[tone];
  return (
    <div className={`rounded-2xl border bg-[#fafafa] p-4 ${cls}`}>
      <p className="text-[11px] uppercase tracking-wide text-[#71717a]">
        {label}
      </p>
      <p className="mt-1 text-base">{value}</p>
    </div>
  );
}

function ManageCard({
  href,
  title,
  description,
  badge,
  badgeTone,
}: {
  href: string;
  title: string;
  description: string;
  badge: string | null;
  badgeTone: "neutral" | "emerald" | "amber";
}) {
  const badgeCls = {
    neutral: "border-[#e4e4e7] text-[#52525b]",
    emerald: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
    amber: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  }[badgeTone];
  return (
    <Link
      href={href}
      className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5 hover:border-[#a1a1aa]"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {badge && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${badgeCls}`}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="mt-2 text-xs text-[#52525b]">{description}</p>
    </Link>
  );
}
