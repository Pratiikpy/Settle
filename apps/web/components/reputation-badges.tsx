"use client";

import { useEffect, useState } from "react";
import { BADGE_CATALOGUE, type BadgeKind } from "@settle/types";
import { timeAgo } from "../lib/format";

/**
 * Soulbound badge collection card. Sits on /at/[handle] beneath the profile
 * stats. Renders nothing if the user has zero badges — we don't want to take
 * profile real estate to say "no achievements yet" because:
 *   1. New profiles dominate the population, and "no achievements" is
 *      noise, not signal.
 *   2. The empty state on the rare-badge view (Honest Disputer, Long
 *      Streamer) is informative; here it's just absence.
 *
 * Each badge links to its on-chain asset on Solscan so reviewers can
 * verify it's a real MPL Core asset with the PermanentFreezeDelegate
 * plugin. The Solscan link is the truth — we don't ask anyone to trust
 * the page.
 */

interface BadgeRow {
  badge_kind: BadgeKind;
  asset_address: string;
  sig_solscan: string | null;
  earned_at: string;
}

interface Props {
  handle: string;
}

export function ReputationBadges({ handle }: Props) {
  const [rows, setRows] = useState<BadgeRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/handles/${encodeURIComponent(handle)}/badges`)
      .then(async (r) => {
        const data = await r.json();
        if (cancelled) return;
        if (r.ok) {
          setRows(Array.isArray(data.badges) ? data.badges : []);
        } else {
          setRows([]); // 4xx → just hide
        }
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [handle]);

  // Loading: render nothing (avoid layout shift on profiles with 0 badges).
  if (rows == null || rows.length === 0) return null;

  const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

  return (
    <section className="mt-8 rounded-3xl border border-[#e4e4e7] card-surface p-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-medium">Reputation badges</h2>
        <span className="text-[11px] text-[#71717a]">
          Soulbound · MPL Core · permanent_freeze
        </span>
      </div>
      <p className="mt-2 text-xs text-[#52525b]">
        Auto-issued when an on-chain pattern is detected. Non-transferable —
        these are bound to the wallet forever.
      </p>

      <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {rows.map((b) => {
          const spec = BADGE_CATALOGUE[b.badge_kind];
          if (!spec) return null;
          const href = `https://solscan.io/token/${b.asset_address}?cluster=${cluster}`;
          return (
            <li key={b.asset_address}>
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-4 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-4 transition hover:border-accent/40 hover:bg-accent/[0.04]"
              >
                <div
                  className="flex h-12 w-12 flex-none items-center justify-center rounded-xl text-2xl"
                  style={{
                    background:
                      "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.08), rgba(0,0,0,0.4))",
                  }}
                  aria-hidden
                >
                  {spec.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm font-medium">{spec.name}</span>
                    <span className="ml-2 text-[11px] text-[#71717a] transition group-hover:text-accent">
                      ↗
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-[#52525b]">
                    {spec.threshold}
                  </p>
                  <p className="mt-1 text-[11px] text-[#71717a]">
                    Earned {timeAgo(b.earned_at)}
                  </p>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
