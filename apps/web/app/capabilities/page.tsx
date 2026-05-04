"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { W6AppShell } from "../../components/w6-app-shell";

/**
 * F9.2 + F3.4 — Capability registry browse + contribute page.
 *
 * Three modes:
 *   1. ?h=<hash> — single-hash lookup view (e.g. arrived from CapabilityBadge link)
 *   2. ?q=<text> — alias prefix search
 *   3. default — verified-only browse list
 *
 * The "Contribute" form lets any wallet add a hash → alias mapping. If
 * the contributor includes the spec components, the server recomputes
 * the hash and the entry lands as verified=true.
 */

interface RegistryEntry {
  capability_hash: string;
  alias: string;
  description: string | null;
  spec_domain: string | null;
  spec_method: string | null;
  spec_path: string | null;
  spec_amount_lamports?: string | null;
  spec_version?: number | null;
  verified: boolean;
  contributed_by_pubkey?: string;
  created_at?: string;
}

interface ListResponse {
  ok: boolean;
  count?: number;
  hash?: string;
  entries: RegistryEntry[];
}

export default function CapabilitiesPage() {
  const search = useSearchParams();
  const focusedHash = search.get("h") ?? "";
  const initialQuery = search.get("q") ?? "";
  const { connected, publicKey } = useWallet();

  const [query, setQuery] = useState(initialQuery);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [entries, setEntries] = useState<RegistryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Contribute form state
  const [showForm, setShowForm] = useState(false);
  const [formHash, setFormHash] = useState("");
  const [formAlias, setFormAlias] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formDomain, setFormDomain] = useState("");
  const [formMethod, setFormMethod] = useState<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">("POST");
  const [formPath, setFormPath] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formVersion, setFormVersion] = useState("1");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    let url = "/api/capabilities";
    const params = new URLSearchParams();
    if (focusedHash) params.set("hash", focusedHash);
    else {
      if (query) params.set("q", query);
      if (verifiedOnly) params.set("verified_only", "1");
    }
    if (Array.from(params).length > 0) url += "?" + params.toString();

    void fetch(url)
      .then((r) => r.json())
      .then((j: ListResponse) => setEntries(j.entries ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [focusedHash, query, verifiedOnly]);

  async function handleContribute() {
    if (!connected || !publicKey) {
      toast.error("Connect a wallet first.");
      return;
    }
    if (!formHash || !formAlias) {
      toast.error("Hash and alias are required.");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        capability_hash: formHash.toLowerCase(),
        alias: formAlias,
        contributed_by_pubkey: publicKey.toBase58(),
      };
      if (formDesc.trim()) body.description = formDesc.trim();
      if (formDomain && formPath && formAmount) {
        body.spec = {
          domain: formDomain,
          method: formMethod,
          path: formPath,
          amount_lamports: formAmount,
          version: Math.max(1, Math.floor(Number(formVersion) || 1)),
        };
      }
      const res = await fetch("/api/capabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.ok) {
        toast.success(json.message ?? "Contributed.");
        setShowForm(false);
        setFormHash("");
        setFormAlias("");
        setFormDesc("");
        setFormDomain("");
        setFormPath("");
        setFormAmount("");
        // Re-fetch
        setQuery((q) => q + "");
      } else {
        toast.error(json.message ?? json.error ?? "Failed.");
      }
    } catch (e) {
      toast.error(`Network error: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <W6AppShell forceSurface="public">
      <div style={{ maxWidth: 880 }}>
        <div className="text-xs text-[#71717a]">F9.2 · Public good</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Capability registry
        </h1>
        <p className="mt-2 text-sm text-[#52525b] max-w-xl">
          Every Settle pact's allowlist can pin a 32-byte capability hash.
          The hash is unforgeable but opaque. This registry maps hashes to
          human aliases — anyone can contribute. Verified entries provide
          the spec that produces the hash, so you can re-derive it
          yourself.
        </p>

        {focusedHash && (
          <div className="mt-6 rounded-xl border border-[#e4e4e7] bg-[#fafafa] p-4 text-xs">
            <p className="text-[#52525b]">Focused on hash</p>
            <code className="mt-1 block break-all font-mono text-[#27272a]">
              {focusedHash}
            </code>
            <Link href="/capabilities" className="mt-2 inline-block text-[#52525b] hover:text-[#09090b]">
              ← Clear filter
            </Link>
          </div>
        )}

        {/* Search + filter */}
        {!focusedHash && (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search aliases…"
              className="flex-1 rounded-lg border border-[#e4e4e7] bg-transparent px-4 py-2 text-sm outline-none focus:border-accent"
            />
            <label className="flex items-center gap-2 text-xs text-[#52525b]">
              <input
                type="checkbox"
                checked={verifiedOnly}
                onChange={(e) => setVerifiedOnly(e.target.checked)}
              />
              Verified only
            </label>
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-background"
            >
              {showForm ? "Cancel" : "Contribute →"}
            </button>
          </div>
        )}

        {/* Contribute form */}
        {showForm && !focusedHash && (
          <section className="mt-6 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
            <h2 className="text-sm font-medium">Contribute a mapping</h2>
            <p className="mt-1 text-xs text-[#52525b]">
              Hash + alias minimum. Adding the spec components makes the
              entry verified — server recomputes the hash and matches.
            </p>
            <div className="mt-4 grid gap-3 text-xs">
              <input
                value={formHash}
                onChange={(e) => setFormHash(e.target.value)}
                placeholder="capability_hash (64 hex)"
                className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 font-mono outline-none focus:border-accent"
              />
              <input
                value={formAlias}
                onChange={(e) => setFormAlias(e.target.value)}
                placeholder="Alias — e.g. Translate EN→FR"
                className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 outline-none focus:border-accent"
              />
              <textarea
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 outline-none focus:border-accent"
              />
              <p className="mt-3 text-[11px] uppercase tracking-wide text-[#71717a]">
                Spec (optional, for verified status)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={formDomain}
                  onChange={(e) => setFormDomain(e.target.value)}
                  placeholder="domain (e.g. arxiv.org)"
                  className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 outline-none focus:border-accent"
                />
                <select
                  value={formMethod}
                  onChange={(e) => setFormMethod(e.target.value as typeof formMethod)}
                  className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 outline-none focus:border-accent"
                >
                  {(["GET", "POST", "PUT", "PATCH", "DELETE"] as const).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <input
                value={formPath}
                onChange={(e) => setFormPath(e.target.value)}
                placeholder="path (e.g. /v1/translate)"
                className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 font-mono outline-none focus:border-accent"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  placeholder="amount_lamports (decimal)"
                  className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 font-mono outline-none focus:border-accent"
                />
                <input
                  value={formVersion}
                  onChange={(e) => setFormVersion(e.target.value)}
                  placeholder="version"
                  className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 font-mono outline-none focus:border-accent"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleContribute()}
                disabled={submitting || !formHash || !formAlias}
                className="mt-2 rounded-full bg-accent px-4 py-2 text-xs font-medium text-background disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit contribution"}
              </button>
            </div>
          </section>
        )}

        {/* Results */}
        <section className="mt-8">
          {loading && (
            <p className="text-sm text-[#52525b]">Loading…</p>
          )}
          {!loading && entries.length === 0 && (
            <p className="text-sm text-[#52525b]">
              No matches. Be the first to contribute one ↑.
            </p>
          )}
          <ul className="grid gap-3">
            {entries.map((e) => (
              <li
                key={`${e.capability_hash}-${e.alias}`}
                className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-4"
              >
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-medium">{e.alias}</h3>
                  <span
                    className={
                      e.verified
                        ? "text-[10px] uppercase tracking-wide text-emerald-300"
                        : "text-[10px] uppercase tracking-wide text-amber-300"
                    }
                  >
                    {e.verified ? "verified ✓" : "unverified"}
                  </span>
                </div>
                {e.description && (
                  <p className="mt-1 text-xs text-[#09090b]/65">{e.description}</p>
                )}
                <code className="mt-2 block break-all font-mono text-[10px] text-[#71717a]">
                  {e.capability_hash}
                </code>
                {(e.spec_domain || e.spec_path) && (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] text-[#52525b]">
                    {e.spec_method && <span className="font-mono">{e.spec_method}</span>}
                    {e.spec_domain && (
                      <span className="col-span-2 truncate font-mono">
                        {e.spec_domain}
                      </span>
                    )}
                    {e.spec_path && (
                      <span className="col-span-3 break-all font-mono">
                        {e.spec_path}
                      </span>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </W6AppShell>
  );
}
