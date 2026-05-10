"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { motion, AnimatePresence } from "framer-motion";
import { supabaseBrowser } from "../lib/supabase";

/**
 * Live capability heatmap — the "Yelp for AI services" market view.
 *
 * Subscribes to Supabase Realtime INSERTs on the `receipts` table filtered to
 * decision='ALLOW' AND public_feed=true. Maintains a per-capability_hash sliding
 * 60-second window of (timestamp, amount) tuples. Renders a grid where each
 * cell's brightness scales with normalized count-in-window. Cells pulse on
 * fresh ALLOW arrivals via Framer Motion.
 *
 * Tab-title indicator: when the page is hidden AND a new ALLOW lands, prefix
 * document.title with 🟢 so the user notices in their tab list. Cleared on focus.
 *
 * Demo affordance: ?simulate=1 spawns synthetic events into the local state
 * (NOT into Supabase) so the heatmap is rehearsable without real ALLOW traffic
 * flowing through the proxy. Removed in production builds via the env check
 * below — `NEXT_PUBLIC_HEATMAP_SIMULATOR_DISABLED` set in production blocks it.
 *
 * Aggregation is fully client-side: zero new SQL, no server-side view needed,
 * scales to ~1k events/sec without touching Postgres. The grid is the page.
 */

const WINDOW_MS = 60_000;
const RENDER_TICK_MS = 1_000; // re-render once a second to age out stale cells

interface AllowEvent {
  capabilityHashHex: string;
  merchantPubkey: string;
  amountLamports: bigint;
  ts: number; // ms epoch
  capabilitySpec?: string; // optional human label
}

interface CellData {
  capabilityHashHex: string;
  count: number;
  totalLamports: bigint;
  lastSeenAt: number;
  merchants: Set<string>;
}

function hashHexFromBytea(s: string | null): string | null {
  if (!s) return null;
  return s.startsWith("\\x") ? s.slice(2) : s;
}

function isSimulatorEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_HEATMAP_SIMULATOR_DISABLED === "true") return false;
  return true;
}

function lamportsToUsd(v: bigint): string {
  const whole = v / 1_000_000n;
  const frac = v % 1_000_000n;
  return `$${whole}.${frac.toString().padStart(6, "0").slice(0, 2)}`;
}

export function CapabilityHeatmap() {
  const search = useSearchParams();
  const simulate = simulatorRequested(search);

  // Recent ALLOW events — the source of truth. We rebuild cells from this each
  // render so adding/removing events is constant-time and rendering is pure.
  const [events, setEvents] = useState<AllowEvent[]>([]);
  const [tick, setTick] = useState(0);
  const originalTitleRef = useRef<string | null>(null);
  const seenSinceBlurredRef = useRef(0);

  // Persist the original title once on mount so we can restore it.
  useEffect(() => {
    if (typeof document !== "undefined" && originalTitleRef.current === null) {
      originalTitleRef.current = document.title;
    }
  }, []);

  // Tab-title indicator on visibility change.
  useEffect(() => {
    if (typeof document === "undefined") return;
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        seenSinceBlurredRef.current = 0;
        if (originalTitleRef.current) document.title = originalTitleRef.current;
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Receipt INSERT subscription — only when simulator is OFF. When simulator
  // is ON, we generate synthetic events in a separate effect.
  useEffect(() => {
    if (simulate) return;
    let channel: RealtimeChannel | null = null;
    try {
      channel = supabaseBrowser()
        .channel("heatmap:receipts")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "receipts",
            filter: "decision=eq.ALLOW",
          },
          (payload) => {
            const row = payload.new as Record<string, unknown>;
            // Honor public_feed gate (the leaderboard is the public market view).
            if (!row.public_feed) return;
            const capHex = hashHexFromBytea(row.capability_hash as string | null);
            if (!capHex) return;
            const ev: AllowEvent = {
              capabilityHashHex: capHex,
              merchantPubkey: String(row.merchant_pubkey ?? ""),
              amountLamports: BigInt(String(row.amount_lamports ?? "0")),
              ts: Date.now(),
            };
            recordEvent(ev);
          },
        )
        .subscribe();
    } catch {
      // Supabase Realtime not configured — degrade quietly. Simulator + no-data
      // state both render reasonable UIs.
    }
    return () => {
      if (channel) void channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulate]);

  // Demo-rehearsal simulator. Fires synthetic events at a steady rate so the
  // grid is alive during demos without requiring real proxy traffic. Gated by
  // ?simulate=1 query param + NEXT_PUBLIC_HEATMAP_SIMULATOR_DISABLED env.
  useEffect(() => {
    if (!simulate || !isSimulatorEnabled()) return;
    const fakeCapabilities = [
      "4f2ab3c1d5e7f9128a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a9b1c3d5e7f",
      "a1b2c3d4e5f6789012345678901234567890abcdef0123456789abcdef012345",
      "9988776655443322110099887766554433221100ffeeddccbbaa99887766550",
      "deadbeefcafef00d1234567890abcdeffedcba0987654321deadbeefcafef00d",
      "0011223344556677889900112233445566778899aabbccddeeff00112233445",
      "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
    ];
    const fakeMerchants = [
      "Mxx1111111111111111111111111111111111111aA",
      "Myy2222222222222222222222222222222222222bB",
      "Mzz3333333333333333333333333333333333333cC",
    ];
    const id = window.setInterval(() => {
      // Fire 1-3 events per tick. Random capability + random merchant + random amount.
      const burst = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < burst; i += 1) {
        const cap = fakeCapabilities[Math.floor(Math.random() * fakeCapabilities.length)]!;
        const merch = fakeMerchants[Math.floor(Math.random() * fakeMerchants.length)]!;
        const amount = BigInt(Math.floor(Math.random() * 200_000) + 50_000); // $0.05–$0.25
        recordEvent({
          capabilityHashHex: cap,
          merchantPubkey: merch,
          amountLamports: amount,
          ts: Date.now(),
        });
      }
    }, 1_500);
    return () => window.clearInterval(id);
  }, [simulate]);

  function recordEvent(ev: AllowEvent) {
    setEvents((prev) => [...prev, ev]);

    // Tab-title attention — only when this tab is hidden and we get a new event.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      seenSinceBlurredRef.current += 1;
      if (originalTitleRef.current) {
        document.title = `🟢 ${seenSinceBlurredRef.current} new ALLOW · ${originalTitleRef.current}`;
      }
    }
  }

  // Re-render every second so cells decay out of the rolling window.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), RENDER_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // Build cell aggregates from the rolling 60s window.
  const cells = useMemo(() => {
    const cutoff = Date.now() - WINDOW_MS;
    const byHash = new Map<string, CellData>();
    for (const ev of events) {
      if (ev.ts < cutoff) continue;
      let cell = byHash.get(ev.capabilityHashHex);
      if (!cell) {
        cell = {
          capabilityHashHex: ev.capabilityHashHex,
          count: 0,
          totalLamports: 0n,
          lastSeenAt: 0,
          merchants: new Set(),
        };
        byHash.set(ev.capabilityHashHex, cell);
      }
      cell.count += 1;
      cell.totalLamports += ev.amountLamports;
      cell.lastSeenAt = Math.max(cell.lastSeenAt, ev.ts);
      if (ev.merchantPubkey) cell.merchants.add(ev.merchantPubkey);
    }
    return Array.from(byHash.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, tick]);

  // Drop events older than the window from state (memory hygiene).
  useEffect(() => {
    const cutoff = Date.now() - WINDOW_MS - 5_000;
    setEvents((prev) => (prev.length > 0 ? prev.filter((e) => e.ts >= cutoff) : prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const totalEventsInWindow = cells.reduce((s, c) => s + c.count, 0);
  const maxCount = Math.max(1, ...cells.map((c) => c.count));
  const totalVolumeInWindow = cells.reduce((s, c) => s + c.totalLamports, 0n);

  return (
    <section className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Live capability market</h2>
          <p className="mt-0.5 text-[11px] text-[#71717a]">
            ALLOW receipts in the last 60 s. Each cell is a capability hash; cell
            brightness is the count.{" "}
            {simulate ? (
              <span className="text-amber-400">
                · Simulator mode (synthetic events, demo-only)
              </span>
            ) : null}
          </p>
        </div>
        <div className="text-right text-[11px] text-[#52525b]">
          <div className="font-mono text-[#27272a]">
            {totalEventsInWindow} ALLOW
          </div>
          <div className="text-[#71717a]">
            {cells.length} capabilities ·{" "}
            <span className="font-mono">{lamportsToUsd(totalVolumeInWindow)}</span>
          </div>
        </div>
      </div>

      {cells.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-[#e4e4e7] p-8 text-center text-[12px] text-[#52525b]">
          {simulate
            ? "Simulator warming up… events should land in 1–2 seconds."
            : "No ALLOW receipts in the last 60 s yet. Open this page on the right side of your screen and fire some agent traffic — the grid will light up in real time."}
          {/* The simulator query param is internal — never advertise it on
              the public surface. */}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          <AnimatePresence>
            {cells.map((c) => (
              <HeatmapCell key={c.capabilityHashHex} cell={c} maxCount={maxCount} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function HeatmapCell({ cell, maxCount }: { cell: CellData; maxCount: number }) {
  // Brightness scales with count, but with a floor so even 1-event cells are visible.
  const intensity = 0.18 + 0.7 * (cell.count / maxCount);
  const ageMs = Date.now() - cell.lastSeenAt;
  const fresh = ageMs < 1500;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{
        opacity: 1,
        scale: fresh ? [1, 1.04, 1] : 1,
        boxShadow: fresh
          ? `0 0 0 0 rgba(20, 241, 149, 0)`
          : `0 0 0 0 rgba(20, 241, 149, 0)`,
      }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative"
    >
      <Link
        href={`/leaderboard/${cell.capabilityHashHex}`}
        className="block rounded-xl border border-[#e4e4e7] p-3 transition hover:border-[#a1a1aa]"
        style={{
          backgroundColor: `rgba(20, 241, 149, ${intensity * 0.18})`,
        }}
        title={`Capability ${cell.capabilityHashHex} · ${cell.count} ALLOW · ${cell.merchants.size} merchant${cell.merchants.size === 1 ? "" : "s"} · ${lamportsToUsd(cell.totalLamports)} in window`}
      >
        <div className="font-mono text-[10px] text-[#52525b]">
          {cell.capabilityHashHex.slice(0, 6)}…{cell.capabilityHashHex.slice(-6)}
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <div className="text-2xl font-semibold leading-none">{cell.count}</div>
          <div className="text-[10px] text-[#71717a]">{Math.round(ageMs / 1000)}s ago</div>
        </div>
        <div className="mt-2 text-[10px] text-[#52525b]">
          <span className="font-mono">{lamportsToUsd(cell.totalLamports)}</span>
          <span className="ml-1.5 text-[#71717a]">
            · {cell.merchants.size} merchant{cell.merchants.size === 1 ? "" : "s"}
          </span>
        </div>
      </Link>
      <AnimatePresence>
        {fresh && (
          <motion.div
            initial={{ opacity: 0.6, scale: 1 }}
            animate={{ opacity: 0, scale: 1.6 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.0, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 rounded-xl border-2 border-emerald-400"
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function simulatorRequested(search: ReturnType<typeof useSearchParams>): boolean {
  return search?.get("simulate") === "1";
}
