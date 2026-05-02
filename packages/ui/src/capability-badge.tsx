"use client";

import { useEffect, useState } from "react";

/**
 * F3.4 — CapabilityBadge.
 *
 * Lazy-fetched badge that resolves a capability_hash to its registered
 * human alias (e.g. "Translate EN→FR"). Falls back to the truncated hash
 * if no alias is registered. Hover/tap reveals the full hash + verified
 * status + spec details (when available).
 *
 * In-component dedupe so N badges for the same hash on a page = 1 fetch.
 */
export interface CapabilityBadgeProps {
  hash: string;
  className?: string;
}

interface RegistryEntry {
  capability_hash: string;
  alias: string;
  description: string | null;
  spec_domain: string | null;
  spec_method: string | null;
  spec_path: string | null;
  verified: boolean;
}

interface RegistryResponse {
  ok: boolean;
  hash: string;
  entries: RegistryEntry[];
}

const HEX64 = /^[0-9a-f]{64}$/i;
const inflight: Record<string, Promise<RegistryResponse | null>> = {};

async function fetchRegistry(hash: string): Promise<RegistryResponse | null> {
  if (inflight[hash]) return inflight[hash]!;
  inflight[hash] = (async () => {
    try {
      const r = await fetch(`/api/capabilities?hash=${hash}`);
      if (!r.ok) return null;
      return (await r.json()) as RegistryResponse;
    } catch {
      return null;
    } finally {
      setTimeout(() => {
        delete inflight[hash];
      }, 60_000);
    }
  })();
  return inflight[hash]!;
}

export function CapabilityBadge({ hash, className }: CapabilityBadgeProps) {
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!HEX64.test(hash)) return undefined;
    void fetchRegistry(hash).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [hash]);

  const entries = data?.entries ?? [];
  // Prefer a verified entry; fall back to any entry; fall back to hash.
  const top = entries.find((e) => e.verified) ?? entries[0] ?? null;
  const showHash = !top;

  const tone = top?.verified
    ? "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-300"
    : top
      ? "border-amber-400/30 bg-amber-400/[0.06] text-amber-300"
      : "border-foreground/15 bg-foreground/[0.04] text-foreground/55";

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span
        className={[
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px]",
          tone,
          className ?? "",
        ].join(" ")}
        title={`capability_hash ${hash.slice(0, 8)}…${hash.slice(-4)}`}
      >
        <span>
          {showHash
            ? `${hash.slice(0, 6)}…${hash.slice(-4)}`
            : top!.alias}
        </span>
        {top && (
          <span className="text-[8px] uppercase tracking-wide opacity-70">
            {top.verified ? "✓" : "?"}
          </span>
        )}
      </span>

      {hover && (top || entries.length > 0) && (
        <div
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-xl border border-foreground/15 bg-background/95 p-3 text-left text-[11px] shadow-lg backdrop-blur"
        >
          <div className="flex items-baseline justify-between">
            <span className="font-medium text-foreground/85">
              {top ? top.alias : "Unregistered"}
            </span>
            {top && (
              <span
                className={
                  top.verified
                    ? "text-[10px] uppercase tracking-wide text-emerald-300"
                    : "text-[10px] uppercase tracking-wide text-amber-300"
                }
              >
                {top.verified ? "verified" : "unverified"}
              </span>
            )}
          </div>
          {top?.description && (
            <p className="mt-2 text-foreground/70">{top.description}</p>
          )}
          {top && (top.spec_domain || top.spec_path) && (
            <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-[10px] text-foreground/55">
              {top.spec_method && <span>method</span>}
              {top.spec_method && <span>{top.spec_method}</span>}
              {top.spec_domain && <span>domain</span>}
              {top.spec_domain && <span className="break-all">{top.spec_domain}</span>}
              {top.spec_path && <span>path</span>}
              {top.spec_path && <span className="break-all">{top.spec_path}</span>}
            </div>
          )}
          <div className="mt-2 break-all border-t border-foreground/10 pt-2 font-mono text-[10px] text-foreground/40">
            {hash}
          </div>
          <a
            href={`/capabilities?h=${hash}`}
            className="mt-2 inline-block text-[10px] text-foreground/60 hover:text-foreground"
          >
            View in registry →
          </a>
        </div>
      )}
    </span>
  );
}
