"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { SettleCard } from "@settle/ui";
import { supabaseBrowser } from "../../lib/supabase";
import { asAuthHeaders, fetchAuthHeaders } from "../../lib/client-auth";

interface CardRow {
  card_pubkey: string;
  label: string;
  daily_cap_lamports: string | number;
  used_today: string | number;
  revoked: boolean;
  expiry_slot: string | number;
}

interface PactRow {
  pact_pubkey: string;
  parent_card: string;
  scope_label: string;
  /** v0.3: 'oneshot' | 'streaming'. Older rows default to 'oneshot'. */
  mode?: "oneshot" | "streaming" | null;
  cap_lamports: string | number | null;
  spent: string | number | null;
  /** Streaming-only fields; null for oneshot. */
  rate_lamports_per_slot?: string | number | null;
  max_total_lamports?: string | number | null;
  claimed?: string | number | null;
  paused?: boolean | null;
  closed: boolean;
  expiry_slot: string | number;
}

function lamportsToUsdc(v: string | number): string {
  const n = typeof v === "string" ? BigInt(v) : BigInt(Math.round(Number(v)));
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return `$${whole}.${frac.toString().padStart(6, "0").slice(0, 2)}`;
}

export default function CardsPage() {
  const { connected, publicKey, signMessage } = useWallet();
  const [cards, setCards] = useState<CardRow[]>([]);
  const [pacts, setPacts] = useState<PactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !publicKey) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let cardsChannel: RealtimeChannel | null = null;
    let pactsChannel: RealtimeChannel | null = null;

    async function loadAndSubscribe() {
      try {
        if (!signMessage) throw new Error("wallet does not support signMessage");
        const auth = await fetchAuthHeaders(publicKey!.toBase58(), signMessage);
        const r = await fetch(`/api/cards/list?authority=${publicKey!.toBase58()}`, {
          headers: asAuthHeaders(auth),
        });
        const data = await r.json();
        if (cancelled) return;
        if (data.ok) {
          setCards(data.cards ?? []);
          setPacts(data.pacts ?? []);
          setAuthError(null);
        } else {
          setAuthError(data.error ?? "fetch_failed");
        }
      } catch (e) {
        if (!cancelled) setAuthError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Subscribe to live updates — agent_cards filtered by authority
      try {
        const supabase = supabaseBrowser();
        cardsChannel = supabase
          .channel(`cards:${publicKey!.toBase58()}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "agent_cards",
              filter: `authority_pubkey=eq.${publicKey!.toBase58()}`,
            },
            (payload) => {
              if (payload.eventType === "INSERT") {
                setCards((prev) => [payload.new as CardRow, ...prev]);
              } else if (payload.eventType === "UPDATE") {
                setCards((prev) =>
                  prev.map((c) =>
                    c.card_pubkey === (payload.new as CardRow).card_pubkey
                      ? (payload.new as CardRow)
                      : c,
                  ),
                );
              } else if (payload.eventType === "DELETE") {
                setCards((prev) =>
                  prev.filter((c) => c.card_pubkey !== (payload.old as CardRow).card_pubkey),
                );
              }
            },
          )
          .subscribe();

        // Pacts — we'd ideally filter by parent_card IN (cards). Workaround: subscribe to all
        // pacts and filter client-side. Acceptable in V1; V2 splits into per-card channels.
        pactsChannel = supabase
          .channel(`pacts:any`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "pacts" },
            (payload) => {
              const newRow = payload.new as PactRow | null;
              const oldRow = payload.old as PactRow | null;
              setCards((currentCards) => {
                const cardIds = new Set(currentCards.map((c) => c.card_pubkey));
                if (newRow && cardIds.has(newRow.parent_card)) {
                  setPacts((prev) => {
                    if (payload.eventType === "INSERT") {
                      return [newRow, ...prev];
                    }
                    if (payload.eventType === "UPDATE") {
                      return prev.map((p) =>
                        p.pact_pubkey === newRow.pact_pubkey ? newRow : p,
                      );
                    }
                    return prev;
                  });
                }
                if (payload.eventType === "DELETE" && oldRow) {
                  setPacts((prev) =>
                    prev.filter((p) => p.pact_pubkey !== oldRow.pact_pubkey),
                  );
                }
                return currentCards;
              });
            },
          )
          .subscribe();
      } catch {
        // Supabase not configured — already shown via empty state
      }
    }

    void loadAndSubscribe();

    return () => {
      cancelled = true;
      if (cardsChannel) void cardsChannel.unsubscribe();
      if (pactsChannel) void pactsChannel.unsubscribe();
    };
  }, [connected, publicKey]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Your cards</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Tap a card to see its receipts and revoke if needed.
      </p>

      {!connected ? (
        <div className="mt-12 rounded-2xl border border-foreground/10 bg-white/[0.02] p-10 text-center">
          <p className="text-sm text-foreground/60">Connect Phantom (top right) to see your cards.</p>
        </div>
      ) : loading ? (
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="h-44 animate-pulse rounded-3xl border border-foreground/10 bg-white/[0.02]" />
          <div className="h-44 animate-pulse rounded-3xl border border-foreground/10 bg-white/[0.02]" />
        </div>
      ) : cards.length === 0 && pacts.length === 0 ? (
        <div className="mt-12 rounded-2xl border border-foreground/10 bg-white/[0.02] p-10 text-center">
          <p className="text-sm text-foreground/60">
            You don&apos;t have any cards yet. Create one to set caps, allowlists, and an expiry —
            then hire AI agents that spend within those rules.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/cards/new"
              className="rounded-full bg-accent px-6 py-2 text-sm font-medium text-background"
            >
              Create your first card
            </Link>
            <Link
              href="/sandbox"
              className="rounded-full border border-foreground/20 px-6 py-2 text-sm hover:bg-foreground/5"
            >
              Get devnet funds first
            </Link>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {cards.map((card) => (
            <Link
              key={card.card_pubkey}
              href={`/cards/${card.card_pubkey}`}
              className="block transition hover:scale-[1.01]"
            >
              <SettleCard
                handle={publicKey ? `@${publicKey.toBase58().slice(0, 6)}` : "@me"}
                balance={lamportsToUsdc(card.daily_cap_lamports)}
                symbol={card.label || "Card"}
                subline={card.revoked ? "Revoked" : "Active"}
                variant="main"
              />
            </Link>
          ))}
          {pacts.map((pact) => {
            const isStreaming = pact.mode === "streaming";
            const balance = isStreaming
              ? `${lamportsToUsdc(pact.claimed ?? "0")} / ${lamportsToUsdc(pact.max_total_lamports ?? "0")}`
              : `${lamportsToUsdc(pact.spent ?? "0")} / ${lamportsToUsdc(pact.cap_lamports ?? "0")}`;
            const subline = pact.closed
              ? "Closed"
              : isStreaming && pact.paused
                ? "Streaming · Paused"
                : isStreaming
                  ? "Streaming · Live"
                  : "Open";
            const symbol = isStreaming
              ? `Stream · ${pact.scope_label}`
              : `Pact · ${pact.scope_label}`;
            return (
              <Link
                key={pact.pact_pubkey}
                href={`/cards/${pact.pact_pubkey}`}
                className="block transition hover:scale-[1.01]"
              >
                <SettleCard
                  handle={publicKey ? `@${publicKey.toBase58().slice(0, 6)}` : "@me"}
                  balance={balance}
                  symbol={symbol}
                  subline={subline}
                  variant="pact"
                />
              </Link>
            );
          })}
        </div>
      )}

      <p className="mt-12 text-xs text-foreground/40">
        Sourced from Supabase via the @settle/indexer onLogs WebSocket subscriber. Real-time updates
        via Supabase Realtime (V2).
      </p>
    </main>
  );
}
