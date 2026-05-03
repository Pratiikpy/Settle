"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { computeCapabilityHashHex } from "@settle/sdk";
import { W6AppShell } from "../../../../components/w6-app-shell";

/**
 * /m/[handle]/capabilities — merchant publishes their tool spec(s).
 *
 * A capability hash is BLAKE3 over canonical JSON of:
 *   { domain, method, path, amount_lamports, version }
 *
 * Publishing the spec → hash mapping in the public registry lets users
 * pin agent cards to your EXACT spec. If a user adds your hash to their
 * card's allowlist, the on-chain spend rejects any call whose
 * recomputed hash doesn't match — strongest custody control.
 *
 * The page computes the hash client-side from the merchant's inputs so
 * they see what they're submitting before the POST. The server then
 * recomputes + flips verified=true on match.
 *
 * Auth: only the wallet matching @handle's pubkey can attribute
 * entries to that pubkey via the form. No server-side signed-challenge
 * gate (the registry is intentionally open-contribution; the
 * verified flag is the trust signal, not the contributor field).
 */

interface RegistryRow {
  capability_hash: string;
  alias: string;
  description: string | null;
  spec_domain: string | null;
  spec_method: string | null;
  spec_path: string | null;
  spec_amount_lamports: string | null;
  spec_version: number | null;
  verified: boolean;
  created_at: string;
}

export default function MerchantCapabilitiesPage() {
  const params = useParams<{ handle: string }>();
  const { connected, publicKey } = useWallet();
  const owner = publicKey?.toBase58() ?? "";

  const [merchantPubkey, setMerchantPubkey] = useState<string | null>(null);
  const [entries, setEntries] = useState<RegistryRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state
  const [domain, setDomain] = useState("");
  const [method, setMethod] = useState<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">(
    "POST",
  );
  const [path, setPath] = useState("/v1/translate");
  const [amountUsdc, setAmountUsdc] = useState("0.02");
  const [version, setVersion] = useState(1);
  const [alias, setAlias] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  // Resolve handle → merchant_pubkey on mount.
  useEffect(() => {
    if (!params.handle) return;
    void fetch(`/api/handles/by-pubkey?handle=${params.handle}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(async () => {
        // Fall through to /api/resolve which works for both pubkey + handle.
        const resp = await fetch(
          `/api/resolve?handle=${encodeURIComponent(params.handle)}`,
        );
        if (resp.ok) {
          const j = (await resp.json()) as { pubkey?: string };
          if (j.pubkey) setMerchantPubkey(j.pubkey);
        }
      });
  }, [params.handle]);

  // Pull existing entries for the merchant's domain (or all if no
  // domain set — the registry filter is per-domain).
  async function reload() {
    setLoading(true);
    try {
      const url = domain
        ? `/api/capabilities?domain=${encodeURIComponent(domain)}`
        : "/api/capabilities";
      const r = await fetch(url);
      if (r.ok) {
        const j = (await r.json()) as { entries: RegistryRow[] };
        setEntries(j.entries.filter((e) => e.spec_domain === domain || !domain));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain]);

  const lamports = (() => {
    const n = parseFloat(amountUsdc);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 1_000_000).toString();
  })();

  // Live-compute the hash from the form so the merchant sees what
  // they're about to submit before clicking Save.
  const previewHash = (() => {
    if (!domain || !path || !alias || !lamports) return null;
    try {
      return computeCapabilityHashHex({
        domain,
        method,
        path,
        amount_lamports: lamports,
        version,
      });
    } catch {
      return null;
    }
  })();

  const isMerchantWallet = merchantPubkey && owner === merchantPubkey;

  async function publish() {
    if (!isMerchantWallet || !previewHash || !lamports) return;
    setBusy(true);
    try {
      const r = await fetch("/api/capabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          capability_hash: previewHash,
          alias,
          description: description || undefined,
          spec: {
            domain,
            method,
            path,
            amount_lamports: lamports,
            version,
          },
          contributed_by_pubkey: owner,
        }),
      });
      if (!r.ok) {
        const j = await r.json();
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      toast.success("Capability published. Hash verified.");
      setAlias("");
      setDescription("");
      await reload();
    } catch (e) {
      toast.error(`Publish failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <W6AppShell forceSurface="merchant">
      <div style={{ maxWidth: 720 }}>
        <header style={{ marginBottom: 28 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Merchant · @{params.handle}
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Capabilities
          </h1>
          <p className="mt-2 text-sm text-[#52525b]">
            Publish your tool specs (domain · method · path · amount · version)
            so users can pin them in their agent cards. The hash is the
            allowlist primitive — pinning yours means an agent can ONLY pay
            you for THIS exact endpoint at THIS exact price.
          </p>
        </header>

        {!connected ? (
          <div className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-6 text-sm text-[#52525b]">
            Connect the wallet that owns @{params.handle} to publish.
          </div>
        ) : merchantPubkey === null ? (
          <p className="text-sm text-[#52525b]">Resolving handle…</p>
        ) : !isMerchantWallet ? (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-4 text-xs text-amber-200">
            You're connected as{" "}
            <code className="font-mono">
              {owner.slice(0, 6)}…{owner.slice(-4)}
            </code>
            , but @{params.handle} resolves to{" "}
            <code className="font-mono">
              {merchantPubkey.slice(0, 6)}…{merchantPubkey.slice(-4)}
            </code>
            . Switch wallets to publish on behalf of this handle.
          </div>
        ) : (
          <>
            {/* Form */}
            <section className="mb-6 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
              <h2 className="text-sm font-medium">New capability</h2>
              <div className="mt-4 grid gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[#71717a]">
                    Domain
                  </p>
                  <input
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="translate.example.com"
                    className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 font-mono text-sm"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[#71717a]">
                      Method
                    </p>
                    <select
                      value={method}
                      onChange={(e) =>
                        setMethod(e.target.value as typeof method)
                      }
                      className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-2 py-2 font-mono text-sm"
                    >
                      <option>GET</option>
                      <option>POST</option>
                      <option>PUT</option>
                      <option>PATCH</option>
                      <option>DELETE</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] uppercase tracking-wide text-[#71717a]">
                      Path
                    </p>
                    <input
                      value={path}
                      onChange={(e) => setPath(e.target.value)}
                      placeholder="/v1/translate"
                      className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 font-mono text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[#71717a]">
                      Amount USDC
                    </p>
                    <input
                      value={amountUsdc}
                      onChange={(e) => setAmountUsdc(e.target.value)}
                      inputMode="decimal"
                      className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-[#71717a]">
                      Version
                    </p>
                    <input
                      type="number"
                      min={1}
                      value={version}
                      onChange={(e) => setVersion(parseInt(e.target.value, 10) || 1)}
                      className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 font-mono text-sm"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[#71717a]">
                    Alias (human name)
                  </p>
                  <input
                    value={alias}
                    onChange={(e) => setAlias(e.target.value)}
                    placeholder="Translate EN→FR"
                    className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-[#71717a]">
                    Description (optional)
                  </p>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Translates English to French via DeepL."
                    className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                  />
                </div>

                {/* Live hash preview — what the merchant is about to submit */}
                {previewHash ? (
                  <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/[0.04] p-3">
                    <p className="text-[10px] uppercase tracking-wide text-emerald-400/70">
                      Capability hash (preview)
                    </p>
                    <code className="mt-1 block break-all font-mono text-[11px] text-emerald-200">
                      {previewHash}
                    </code>
                    <p className="mt-2 text-[10px] text-[#52525b]">
                      Server recomputes from the spec on submit. Verified ✓
                      flag flips on match.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-[#71717a]">
                    Fill in domain, path, alias, and amount to preview the
                    hash.
                  </p>
                )}

                <button
                  onClick={publish}
                  disabled={busy || !previewHash}
                  className="rounded-full bg-accent px-5 py-2 text-xs font-medium text-background disabled:opacity-50"
                >
                  {busy ? "Publishing…" : "Publish capability"}
                </button>
              </div>
            </section>

            {/* Existing entries */}
            <section>
              <header className="mb-3 flex items-baseline justify-between">
                <h2 className="text-sm font-medium">
                  Published {domain && `for ${domain}`}
                </h2>
                {loading && (
                  <span className="text-[11px] text-[#71717a]">
                    loading…
                  </span>
                )}
              </header>
              {entries.length === 0 ? (
                <p className="text-xs text-[#71717a]">
                  Nothing published yet — your first entry seeds the registry.
                </p>
              ) : (
                <ul className="space-y-2">
                  {entries.map((e) => (
                    <li
                      key={`${e.capability_hash}-${e.alias}`}
                      className={`rounded-xl border p-3 text-xs ${
                        e.verified
                          ? "border-emerald-400/30 bg-emerald-400/[0.03]"
                          : "border-[#e4e4e7] bg-[#fafafa]"
                      }`}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <strong>{e.alias}</strong>
                        {e.verified ? (
                          <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[9px] uppercase tracking-wide text-emerald-300">
                            ✓ verified
                          </span>
                        ) : (
                          <span className="rounded-full border border-[#e4e4e7] bg-[#f4f4f5] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#52525b]">
                            unverified
                          </span>
                        )}
                      </div>
                      {e.description && (
                        <p className="mt-1 text-[#52525b]">
                          {e.description}
                        </p>
                      )}
                      {e.spec_domain && (
                        <p className="mt-2 font-mono text-[10px] text-[#52525b]">
                          {e.spec_method} {e.spec_domain}
                          {e.spec_path}{" "}
                          {e.spec_amount_lamports && (
                            <>
                              ·{" "}
                              {(
                                Number(e.spec_amount_lamports) / 1e6
                              ).toFixed(2)}{" "}
                              USDC
                            </>
                          )}{" "}
                          · v{e.spec_version}
                        </p>
                      )}
                      <code className="mt-2 block break-all font-mono text-[10px] text-[#71717a]">
                        {e.capability_hash}
                      </code>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Link
              href="/docs#capability"
              className="mt-6 inline-block text-[11px] text-accent hover:underline"
            >
              Capability hash docs →
            </Link>
          </>
        )}
      </div>
    </W6AppShell>
  );
}
