"use client";

/**
 * F3.11 — `/capabilities/discover` — NL capability discovery.
 *
 * User types a natural-language need; UI calls /api/capabilities/discover
 * (NVIDIA NIM-powered ranker), renders top results with reasoning.
 */
import { useState } from "react";
import { W6AppShell } from "../../../components/w6-app-shell";

interface Result {
  alias: string;
  hash: string;
  description: string | null;
  reasoning: string;
}

export default function DiscoverPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 3) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/capabilities/discover?q=${encodeURIComponent(q.trim())}`,
      );
      const json = await r.json();
      if (!r.ok) {
        setError(json.error ?? "search_failed");
        setResults([]);
      } else {
        setResults(json.results ?? []);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <W6AppShell forceSurface="public">
      <div style={{ maxWidth: 720 }}>
        <div style={{ marginBottom: 24 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Capabilities · discover
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Find a capability.
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
            Describe what you need in plain English. We&rsquo;ll rank the
            registered capabilities by relevance and explain why.
          </p>
        </div>

        <form
          onSubmit={search}
          style={{ display: "flex", gap: 8, marginBottom: 14 }}
        >
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. fast translation for spanish→english"
            className="w6-input w6-input-lg"
            style={{ flex: 1 }}
            maxLength={300}
          />
          <button
            type="submit"
            disabled={loading || q.trim().length < 3}
            className="w6-btn w6-btn-primary w6-btn-lg"
          >
            {loading ? "Thinking…" : "Find"}
          </button>
        </form>

        {results.length === 0 && !loading && !q && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
              marginBottom: 24,
            }}
          >
            <div
              className="w6-eyebrow"
              style={{ fontSize: 11, color: "var(--w6-ink-3)" }}
            >
              Try one of these
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {[
                "fetch arxiv abstract",
                "translate JA to EN",
                "summarize a URL",
                "OCR a receipt image",
                "look up wallet balance",
                "find a place by name",
              ].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => {
                    setQ(sample);
                  }}
                  className="w6-chip"
                  style={{
                    padding: "6px 12px",
                    fontSize: 12.5,
                    border: "1px solid var(--w6-rule)",
                    borderRadius: 999,
                    background: "var(--w6-paper)",
                    cursor: "pointer",
                  }}
                >
                  {sample}
                </button>
              ))}
            </div>
            <div
              className="w6-muted"
              style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}
            >
              The full registry is browsable at{" "}
              <a
                href="/capabilities"
                style={{
                  color: "var(--w6-accent)",
                  textDecoration: "underline",
                }}
              >
                /capabilities
              </a>
              . Three demo capabilities (arxiv-fetch, translate, summarize) are
              live on devnet today.
            </div>
          </div>
        )}

        {error && (
          <div
            className="w6-card"
            style={{
              padding: 16,
              marginBottom: 18,
              borderColor: "var(--w6-warn-cluster)",
            }}
          >
            ⚠ {error}
          </div>
        )}

        {results.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {results.map((r, i) => (
              <div key={r.hash} className="w6-card" style={{ padding: 18 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                  }}
                >
                  <h3
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      margin: 0,
                    }}
                  >
                    <span className="w6-muted" style={{ marginRight: 8 }}>
                      #{i + 1}
                    </span>
                    {r.alias}
                  </h3>
                  <code
                    className="w6-muted w6-mono"
                    style={{ fontSize: 10.5 }}
                  >
                    {r.hash.slice(0, 8)}…
                  </code>
                </div>
                {r.description && (
                  <p
                    className="w6-muted"
                    style={{ fontSize: 12.5, margin: "4px 0 0" }}
                  >
                    {r.description}
                  </p>
                )}
                <p
                  style={{
                    fontSize: 12.5,
                    margin: "8px 0 0",
                    color: "var(--w6-ink-2)",
                  }}
                >
                  {r.reasoning}
                </p>
              </div>
            ))}
          </div>
        )}

        {q && !loading && results.length === 0 && !error && (
          <p
            className="w6-muted"
            style={{ marginTop: 24, fontSize: 14 }}
          >
            No matches yet. Try a broader query.
          </p>
        )}
      </div>
    </W6AppShell>
  );
}
