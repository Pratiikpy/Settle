"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

interface Template {
  slug: string;
  title: string;
  description: string;
  author_pubkey: string;
  cap_usdc: number;
  expiry_minutes: number;
  merchant_allowlist: string[];
  default_purpose: string;
  icon_emoji: string;
  use_count: number;
  featured: boolean;
  created_at: string;
}

export function TemplateBrowser({ initial }: { initial: Template[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "featured">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initial.filter((t) => {
      if (filter === "featured" && !t.featured) return false;
      if (!q) return true;
      return (
        t.slug.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
  }, [initial, query, filter]);

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates…"
          className="flex-1 min-w-[240px] rounded-full border border-foreground/15 bg-transparent px-5 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="flex gap-1 rounded-full border border-foreground/15 bg-white/[0.02] p-1 text-xs">
          {(["all", "featured"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={
                filter === k
                  ? "rounded-full bg-accent px-4 py-1 text-background"
                  : "rounded-full px-4 py-1 text-foreground/60 hover:text-foreground"
              }
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-foreground/10 bg-white/[0.02] p-10 text-center text-sm text-foreground/50">
            No templates match. Try clearing the search.
          </div>
        ) : (
          filtered.map((t) => (
            <Link
              key={t.slug}
              href={`/agents/templates/${t.slug}`}
              className="group relative overflow-hidden rounded-2xl border border-foreground/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-5 transition hover:border-accent/40"
            >
              {t.featured && (
                <span className="absolute right-3 top-3 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
                  Featured
                </span>
              )}
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-xs font-semibold text-accent">
                  {t.icon_emoji}
                </span>
                <h3 className="text-base font-medium">{t.title}</h3>
              </div>
              <p className="mt-3 line-clamp-3 text-xs text-foreground/60">{t.description}</p>
              <div className="mt-4 flex items-center gap-3 text-[11px] text-foreground/45">
                <span>Cap ${Number(t.cap_usdc).toFixed(2)}</span>
                <span>·</span>
                <span>{t.expiry_minutes}m</span>
                <span>·</span>
                <span>{t.merchant_allowlist.length || "open"} merchants</span>
                <span>·</span>
                <span>{t.use_count} hires</span>
              </div>
            </Link>
          ))
        )}
      </div>
    </>
  );
}
