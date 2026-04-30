"use client";

import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabaseBrowser } from "../lib/supabase";

/**
 * Live audience counter (F3).
 *
 * Uses Supabase Realtime presence on a per-handle channel. Every viewer joins with an
 * anonymous client_id (NOT a wallet pubkey — privacy-preserving) and the count is
 * surfaced as "N viewing now". Plus a separate Realtime subscription on receipts inserted
 * for this pubkey shows "last receipt Ns ago".
 *
 * Channel: `presence:handle:<handle>`. We use `track()` with no payload (just heartbeat)
 * so the count is reliable even when the page is mostly idle.
 *
 * Falls back to invisible no-op if Supabase Realtime is unconfigured.
 */
export function LivePresence({ handle, pubkey }: { handle: string; pubkey: string }) {
  const [viewers, setViewers] = useState<number | null>(null);
  const [lastReceiptAt, setLastReceiptAt] = useState<string | null>(null);
  const [tickNow, setTickNow] = useState<number>(Date.now());

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let receiptChannel: RealtimeChannel | null = null;
    try {
      const supabase = supabaseBrowser();
      channel = supabase.channel(`presence:handle:${handle}`, {
        config: { presence: { key: cryptoRandomId() } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (!channel) return;
          const state = channel.presenceState();
          // presenceState returns Record<key, { …meta }[]>; count distinct keys
          setViewers(Object.keys(state).length);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED" && channel) {
            await channel.track({ joined_at: new Date().toISOString() });
          }
        });

      // Live "last receipt" — listen for INSERT on receipts where merchant_pubkey OR
      // card_pubkey-via-authority matches. Cheap version: just receipts where the public
      // feed shows this handle's pubkey as merchant.
      receiptChannel = supabase
        .channel(`profile-receipts:${pubkey}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "receipts",
            filter: `merchant_pubkey=eq.${pubkey}`,
          },
          (payload) => {
            const row = payload.new as { created_at?: string };
            if (row?.created_at) setLastReceiptAt(row.created_at);
          },
        )
        .subscribe();
    } catch {
      // Supabase not configured — silently degrade
    }

    return () => {
      if (channel) void channel.untrack().then(() => channel?.unsubscribe());
      if (receiptChannel) void receiptChannel.unsubscribe();
    };
  }, [handle, pubkey]);

  // Tick clock every 5s so the "Ns ago" string stays fresh
  useEffect(() => {
    const id = window.setInterval(() => setTickNow(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, []);

  if (viewers === null) return null;
  if (viewers <= 0) return null;

  const lastAgo = lastReceiptAt ? humanizeAgo(lastReceiptAt, tickNow) : null;

  return (
    <div className="mt-4 flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-[11px] text-accent">
      <span className="relative inline-flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      <span>
        {viewers === 1 ? "1 viewing now" : `${viewers} viewing now`}
        {lastAgo && <> · last receipt {lastAgo}</>}
      </span>
    </div>
  );
}

function humanizeAgo(iso: string, nowMs: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.max(0, Math.round((nowMs - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

function cryptoRandomId(): string {
  // Anonymous per-tab id. Not a wallet pubkey; privacy-preserving.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
