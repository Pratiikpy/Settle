"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { HandleBadge, TrustScoreBadge } from "@settle/ui";
import { W6AppShell } from "../../../components/w6-app-shell";
import { LivePresence } from "../../../components/live-presence";
import { HandlePayCta } from "../../../components/handle-pay-cta";
import { FollowButton } from "../../../components/follow-button";
import { ReputationBadges } from "../../../components/reputation-badges";
import { lamportsToUsdc, timeAgo } from "../../../lib/format";
import { getSolscanUrl } from "../../../lib/solana";
import { asAuthHeaders, fetchAuthHeaders } from "../../../lib/client-auth";

interface Profile {
  handle: string;
  pubkey: string;
  sns_domain: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  public_receipts_count: number;
  public_total_usdc: string;
  public_receipts: Array<{
    request_id: string;
    merchant_pubkey: string;
    amount_lamports: string;
    decision_slot: number;
    sig_solscan: string | null;
    created_at: string;
  }>;
  earnings?: {
    lifetime_earned_usdc: string;
    last_30_days_usdc: string;
    top_senders_count: number;
    recent_inbound: Array<{
      request_id: string;
      card_pubkey: string;
      amount_lamports: string;
      capability_hash: string | null;
      sig_solscan: string | null;
      created_at: string;
    }>;
  };
}

interface Relationship {
  is_following: boolean;
  /** F15 — total tips you've sent to this handle, per receipts table. */
  you_sent_count: number;
  you_sent_total_usdc: string;
}

interface FollowStats {
  followers_count: number;
  recent_followers: Array<{ pubkey: string; since: string }>;
}

export default function HandleProfilePage() {
  const params = useParams<{ handle: string }>();
  const search = useSearchParams();
  const { connected, publicKey, signMessage } = useWallet();
  const requestedAmount = search?.get("req") ?? search?.get("amount") ?? null;
  const requestedNote = search?.get("note") ?? null;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [followStats, setFollowStats] = useState<FollowStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.handle) return;
    let cancelled = false;
    void fetch(`/api/handles/${params.handle}/profile`)
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (r.ok) {
          setProfile(data);
          setError(null);
        } else {
          setError(data.error ?? "fetch_failed");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(String((e as Error).message ?? e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    // F16 — public follower stats (no auth required).
    void fetch(`/api/follows/${params.handle}/stats`)
      .then(async (r) => {
        const data = await r.json();
        if (!cancelled && r.ok) {
          setFollowStats({
            followers_count: data.followers_count ?? 0,
            recent_followers: data.recent_followers ?? [],
          });
        }
      })
      .catch(() => {
        // Non-fatal — count badge just doesn't render.
      });
    return () => {
      cancelled = true;
    };
  }, [params.handle]);

  // F15 — wallet-aware relationship: "you've sent X to this handle / are following".
  // Re-fetches when the wallet connection changes. Server requires wallet-sig auth so
  // a stranger reading the page never sees this block.
  useEffect(() => {
    if (!profile || !connected || !publicKey || !signMessage) {
      setRelationship(null);
      return;
    }
    if (publicKey.toBase58() === profile.pubkey) {
      // Looking at your own profile — relationship summary doesn't apply.
      setRelationship(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
        const r = await fetch(`/api/handles/${params.handle}/relationship`, {
          headers: asAuthHeaders(auth),
        });
        const data = await r.json();
        if (!cancelled && r.ok) {
          setRelationship({
            is_following: Boolean(data.is_following),
            you_sent_count: Number(data.you_sent_count ?? 0),
            you_sent_total_usdc: String(data.you_sent_total_usdc ?? "0.00"),
          });
        }
      } catch {
        // Non-fatal — block just doesn't render.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, connected, publicKey, signMessage, params.handle]);

  if (loading) {
    return (
      <W6AppShell>
        <div className="mx-auto max-w-2xl">
          <div className="w6-skel" style={{ height: 128, borderRadius: 24 }} />
        </div>
      </W6AppShell>
    );
  }

  if (error === "handle_not_found") {
    return (
      <W6AppShell>
        <div className="mx-auto max-w-md text-center" style={{ padding: "64px 24px" }}>
          <h1 className="w6-heading" style={{ fontSize: 28, margin: 0 }}>@{params.handle} not found</h1>
          <p className="w6-muted" style={{ marginTop: 12, fontSize: 14 }}>
            This handle hasn&apos;t been claimed on Settle.
          </p>
          <Link
            href="/onboarding"
            className="w6-btn w6-btn-primary"
            style={{ marginTop: 32 }}
          >
            Claim a handle
          </Link>
        </div>
      </W6AppShell>
    );
  }

  if (!profile) {
    return (
      <W6AppShell>
        <div className="mx-auto max-w-md text-center" style={{ padding: "64px 24px" }}>
          <h1 className="w6-heading" style={{ fontSize: 28, margin: 0 }}>Profile unavailable</h1>
          <p className="w6-muted" style={{ marginTop: 12, fontSize: 14 }}>
            {error === "supabase_unconfigured"
              ? "The directory is offline. Try again later."
              : "Something went wrong loading this profile."}
          </p>
        </div>
      </W6AppShell>
    );
  }

  return (
    <W6AppShell>
      <div className="mx-auto max-w-2xl">
        {/* Profile header */}
        <div className="rounded-3xl border border-[#e4e4e7] card-surface p-8">
          <div className="flex items-center gap-3">
            <HandleBadge
              handle={`@${profile.handle}`}
              {...(profile.sns_domain ? { domain: profile.sns_domain } : {})}
              copyable
            />
            {/* F3.12 / M6 — trust score next to handle. Hover for breakdown. */}
            <TrustScoreBadge pubkey={profile.pubkey} variant="full" />
          </div>
          <LivePresence handle={profile.handle} pubkey={profile.pubkey} />
          {profile.display_name && (
            <h1 className="mt-4 text-3xl font-semibold tracking-tight">
              {profile.display_name}
            </h1>
          )}

          {/* F8 — query-param-driven one-tap pay CTA. Triggered by ?req=20&note=… on the URL.
              Same URL pasted into X renders as a Phantom Blink via the actions.json mapping. */}
          <HandlePayCta
            handle={profile.handle}
            recipientPubkey={profile.pubkey}
            displayName={profile.display_name ?? `@${profile.handle}`}
            requestedAmount={requestedAmount}
            requestedNote={requestedNote}
          />

          {/* F16 — Follow button + public follower count. */}
          <div className="mt-4 flex items-center gap-3">
            {connected && publicKey && publicKey.toBase58() !== profile.pubkey && (
              <FollowButton handle={profile.handle} />
            )}
            {followStats && (
              <span className="text-xs text-[#52525b]">
                <span className="font-medium text-[#27272a]">
                  {followStats.followers_count}
                </span>{" "}
                follower{followStats.followers_count === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {/* F15 — wallet-aware relationship summary: shows above the public-spend stats
              when you're already a sender to this handle. */}
          {relationship && relationship.you_sent_count > 0 && (
            <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-3 text-xs text-[#27272a]">
              You&rsquo;ve sent <span className="font-medium text-[#09090b]">${relationship.you_sent_total_usdc}</span>{" "}
              to @{profile.handle} across {relationship.you_sent_count} payment
              {relationship.you_sent_count === 1 ? "" : "s"}.
              {relationship.is_following ? " · You're following them." : ""}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[#52525b]">
            <span>
              Joined{" "}
              {new Date(profile.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
              })}
            </span>
            <a
              href={`https://solscan.io/account/${profile.pubkey}?cluster=${process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet"}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#09090b]"
            >
              {profile.pubkey.slice(0, 8)}…{profile.pubkey.slice(-4)} ↗
            </a>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5">
              <div className="text-xs uppercase tracking-wider text-[#71717a]">
                Public spend
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight">
                ${profile.public_total_usdc}
              </div>
            </div>
            <div className="rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5">
              <div className="text-xs uppercase tracking-wider text-[#71717a]">
                Public receipts
              </div>
              <div className="mt-2 text-3xl font-semibold tracking-tight">
                {profile.public_receipts_count}
              </div>
            </div>
          </div>

          {/* F18 — Public earnings transparency. Only renders when there's flow to show. */}
          {profile.earnings && Number(profile.earnings.lifetime_earned_usdc) > 0 && (
            <div className="mt-4 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5">
              <div className="text-xs uppercase tracking-wider text-[#71717a]">
                Earnings (public_feed only)
              </div>
              <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-[#71717a] text-xs">Lifetime</div>
                  <div className="font-semibold">${profile.earnings.lifetime_earned_usdc}</div>
                </div>
                <div>
                  <div className="text-[#71717a] text-xs">Last 30 days</div>
                  <div className="font-semibold">${profile.earnings.last_30_days_usdc}</div>
                </div>
                <div>
                  <div className="text-[#71717a] text-xs">Top senders</div>
                  <div className="font-semibold">{profile.earnings.top_senders_count}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Soulbound reputation badges (renders nothing if user has zero). */}
        <ReputationBadges handle={profile.handle} />

        {/* Public receipts feed */}
        <h2 className="mt-12 text-lg font-medium">Public activity</h2>
        {profile.public_receipts.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-6 text-sm text-[#52525b]">
            No public activity yet. {profile.display_name ?? `@${profile.handle}`} keeps
            their spend private by default.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {profile.public_receipts.map((r) => (
              <div
                key={r.request_id}
                className="flex items-center justify-between rounded-xl border border-[#e4e4e7] p-4"
              >
                <div>
                  <div className="text-sm">
                    <span className="font-mono text-xs text-[#52525b]">
                      {r.merchant_pubkey.slice(0, 6)}…
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[#71717a]">
                    {timeAgo(r.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">
                    ${lamportsToUsdc(r.amount_lamports)}
                  </span>
                  {r.sig_solscan && (
                    <a
                      href={getSolscanUrl(r.sig_solscan)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[#71717a] hover:text-accent"
                    >
                      ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="w6-muted" style={{ marginTop: 48, fontSize: 12 }}>
          Only receipts marked <code>public_feed=true</code> are visible. Owners control
          privacy per-card.
        </p>
      </div>
    </W6AppShell>
  );
}
