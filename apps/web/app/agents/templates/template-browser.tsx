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
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search templates…"
          className="w6-input"
          style={{ flex: 1, minWidth: 240 }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          {(["all", "featured"] as const).map((k) => {
            const on = filter === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                style={{
                  height: 32,
                  padding: "0 14px",
                  borderRadius: 999,
                  border: `1px solid ${on ? "var(--w6-ink)" : "var(--w6-rule)"}`,
                  background: on ? "var(--w6-ink)" : "#fff",
                  color: on ? "#fff" : "var(--w6-ink-2)",
                  fontSize: 12.5,
                  fontWeight: 500,
                  textTransform: "capitalize",
                  cursor: "pointer",
                }}
              >
                {k}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div
          className="w6-card"
          style={{ padding: 40, textAlign: "center" }}
        >
          {initial.length === 0 ? (
            <>
              <div
                className="w6-heading"
                style={{ fontSize: 20, marginBottom: 8 }}
              >
                No templates yet
              </div>
              <p
                className="w6-muted"
                style={{
                  fontSize: 13,
                  maxWidth: 480,
                  margin: "0 auto 16px",
                  lineHeight: 1.5,
                }}
              >
                Templates are open-source agent recipes. Be the first to
                publish — others can hire your agent in one tap.
              </p>
              <Link
                href="/agents/templates/new"
                className="w6-btn w6-btn-primary w6-btn-sm"
              >
                Publish a template
              </Link>
            </>
          ) : (
            <p className="w6-muted" style={{ fontSize: 13 }}>
              No templates match. Try clearing the search.
            </p>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          }}
        >
          {filtered.map((t) => (
            <Link
              key={t.slug}
              href={`/agents/templates/${t.slug}`}
              className="w6-card w6-card-hover"
              style={{
                position: "relative",
                padding: 20,
                display: "block",
                textDecoration: "none",
                color: "var(--w6-ink)",
              }}
            >
              {t.featured && (
                <span
                  style={{
                    position: "absolute",
                    right: 12,
                    top: 12,
                    padding: "2px 8px",
                    borderRadius: 999,
                    background: "var(--w6-ink)",
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                  }}
                >
                  Featured
                </span>
              )}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: "var(--w6-bg-3)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                  }}
                >
                  {t.icon_emoji}
                </span>
                <h3
                  className="w6-heading"
                  style={{ fontSize: 16, margin: 0 }}
                >
                  {t.title}
                </h3>
              </div>
              <p
                className="w6-muted"
                style={{
                  marginTop: 12,
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {t.description}
              </p>
              <div
                className="w6-muted"
                style={{
                  marginTop: 14,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  fontSize: 11,
                  color: "var(--w6-ink-4)",
                }}
              >
                <span>Cap ${Number(t.cap_usdc).toFixed(2)}</span>
                <span>·</span>
                <span>{t.expiry_minutes}m</span>
                <span>·</span>
                <span>{t.merchant_allowlist.length || "open"} merchants</span>
                <span>·</span>
                <span>{t.use_count} hires</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
