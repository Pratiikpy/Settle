"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { W6AppShell } from "../../../components/w6-app-shell";

/**
 * F7.3 / F33.4 — Relayer delegation page.
 *
 * Phase 5's automated features (scheduled sends, auto-refill, gift
 * fulfillment) need a wallet that can sign txs without the user being
 * online. Settle solves this by having the user spawn a NEW Pact card
 * with our relayer pubkey as the agent. The card carries a hard
 * daily_cap; the relayer can't exceed it. Spend allowlist is the user's
 * choice. Card is revocable any time.
 *
 * Critical UX truth: delegation is creating a NEW card, NOT rotating an
 * existing one. The Anchor program (lib.rs) does not expose a
 * rotate-agent ix because once a card is issued, in-flight sessions
 * depend on its agent identity — silently rotating mid-flight would
 * break them. So delegation = "spawn a fresh card with these
 * parameters and the relayer as agent."
 *
 * This page is the briefing: shows the relayer pubkey, explains what
 * delegated cards CAN and CANNOT do, then routes to /agents/spawn with
 * the relayer pre-filled.
 */

interface RelayerInfo {
  configured: boolean;
  pubkey: string | null;
  capabilities: string[];
  unsupported: string[];
}

export default function RelayerSettingsPage() {
  const [info, setInfo] = useState<RelayerInfo | null>(null);

  useEffect(() => {
    fetch("/api/relayer")
      .then((r) => r.json())
      .then((j: { relayer: RelayerInfo }) => setInfo(j.relayer));
  }, []);

  return (
    <W6AppShell forceSurface="consumer">
      <div style={{ maxWidth: 880 }}>
        <header className="mb-8">
          <h1 className="text-3xl font-medium tracking-tight">Relayer</h1>
          <p className="mt-2 text-sm text-foreground/60">
            Settle's automated features need a wallet that can sign for you when
            you're offline — to fire a scheduled send, to top up a card, to
            fulfill a gift the recipient just claimed. We expose ours here so
            you can decide whether to delegate.
          </p>
        </header>

        {!info ? (
          <p className="text-sm text-foreground/60">Loading…</p>
        ) : !info.configured ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
            <p className="text-sm text-amber-300">
              Relayer not configured on this deployment. Automated features
              (scheduled sends, auto-refill, gift fulfillment) won't fire until
              an operator sets <code className="font-mono">SETTLE_RELAYER_PRIVKEY</code>.
            </p>
          </div>
        ) : (
          <>
            {/* Pubkey */}
            <section className="rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
              <p className="text-[11px] uppercase tracking-wide text-foreground/40">
                Relayer pubkey
              </p>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <code className="break-all text-xs text-foreground/80">
                  {info.pubkey}
                </code>
                <button
                  onClick={() => {
                    if (info.pubkey) {
                      void navigator.clipboard
                        .writeText(info.pubkey)
                        .then(() => toast.success("Copied"));
                    }
                  }}
                  className="text-[11px] text-foreground/60 hover:text-foreground"
                >
                  copy
                </button>
              </div>
            </section>

            {/* What it can do */}
            <section className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.02] p-5">
              <p className="text-[11px] uppercase tracking-wide text-emerald-400/70">
                Cards delegated to this relayer can
              </p>
              <ul className="mt-3 space-y-2 text-xs text-foreground/80">
                {info.capabilities.map((c) => (
                  <li key={c}>+ {c}</li>
                ))}
              </ul>
            </section>

            {/* What it cannot do */}
            <section className="mt-4 rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
              <p className="text-[11px] uppercase tracking-wide text-foreground/40">
                What the relayer cannot do
              </p>
              <ul className="mt-3 space-y-2 text-xs text-foreground/60">
                {info.unsupported.map((u) => (
                  <li key={u}>— {u}</li>
                ))}
              </ul>
            </section>

            {/* Delegation CTA */}
            <section className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6">
              <h2 className="text-sm font-medium">Delegate by spawning a card</h2>
              <p className="mt-2 text-xs text-foreground/60">
                A Pact card is issued with its <code>agent_pubkey</code> baked
                in at <code>create_card</code> time. The Anchor program does
                not expose a rotate-agent ix — once a card is issued, its
                agent is fixed (in-flight sessions depend on it). To delegate,
                you create a NEW card with this relayer as the agent. The
                relayer can spend only within the daily cap + allowlist you
                set; you can revoke any time. Existing non-delegated cards
                are unaffected.
              </p>
              <Link
                href={`/cards/new?agent=${info.pubkey ?? ""}`}
                className="mt-5 inline-flex items-center rounded-full bg-accent px-5 py-2 text-xs font-medium text-background"
              >
                Spawn delegated card →
              </Link>
              <p className="mt-3 text-[11px] text-foreground/40">
                You'll review the cap, allowlist, and expiry on the next page
                before signing. The relayer is bound to the card you sign for
                — there's no agent rotation later.
              </p>
            </section>

            {/* What happens next */}
            <section className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6">
              <h2 className="text-sm font-medium">After you delegate</h2>
              <ol className="mt-3 space-y-2 text-xs text-foreground/60">
                <li>
                  1. Your scheduled sends, auto-refills, and gift fulfillments
                  will start firing on cadence (every 5 min cron tick).
                </li>
                <li>
                  2. Each fire writes a row in <code>phase5_executions</code>{" "}
                  with the Solana tx signature — you can audit every action.
                </li>
                <li>
                  3. Until <code>SETTLE_RELAYER_LIVE=true</code> is set on this
                  deployment, the signer logs intent rows in dry-run mode.
                </li>
              </ol>
            </section>
          </>
        )}
      </div>
    </W6AppShell>
  );
}
