"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { W6AppShell } from "../../../components/w6-app-shell";
import { asAuthHeaders, fetchAuthHeaders } from "../../../lib/client-auth";

/**
 * F20 — Creator-side collab manager.
 *
 * Lets creator A enter creator B's pubkey + a split ratio + a label, then mints a
 * shareable /collab/[id] link. The page also lists existing collabs so they can be
 * reused.
 *
 * Tradeoff (from plan): we ship the off-chain tx-bundling version (two
 * TransferChecked ixs, atomic via single Solana tx). On-chain split via transfer
 * hooks is V2 — strictly more complex to deploy and not necessary for V1.
 */

interface Collab {
  id: string;
  creator_a_pubkey: string;
  creator_b_pubkey: string;
  ratio_bps_a: number;
  label: string;
  active: boolean;
  created_at: string;
}

export default function CollabHubPage() {
  const { connected, publicKey, signMessage } = useWallet();
  const [collabs, setCollabs] = useState<Collab[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [creatorB, setCreatorB] = useState("");
  const [ratioA, setRatioA] = useState(50);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!connected || !publicKey) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void fetch(`/api/collabs?organizer=${publicKey.toBase58()}`)
      .then(async (r) => {
        const d = await r.json();
        if (!cancelled && d.ok) setCollabs(d.items ?? []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connected, publicKey]);

  async function create() {
    if (!connected || !publicKey || !signMessage) {
      toast.error("Connect a wallet first.");
      return;
    }
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(creatorB)) {
      toast.error("Enter a valid Solana pubkey for creator B.");
      return;
    }
    if (creatorB === publicKey.toBase58()) {
      toast.error("Creator B can't be yourself.");
      return;
    }
    if (!label.trim()) {
      toast.error("Pick a label.");
      return;
    }
    setSubmitting(true);
    try {
      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      const r = await fetch("/api/collabs", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...asAuthHeaders(auth) },
        body: JSON.stringify({
          creator_a_pubkey: publicKey.toBase58(),
          creator_b_pubkey: creatorB,
          ratio_bps_a: Math.round(ratioA * 100),
          label,
          description: description || undefined,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.message ?? d.error ?? "create_failed");
      toast.success("Collab created.", {
        action: {
          label: "Open",
          onClick: () => window.open(`/collab/${d.id}`, "_blank"),
        },
      });
      setLabel("");
      setDescription("");
      setCreatorB("");
      // Reload list
      const listRes = await fetch(`/api/collabs?organizer=${publicKey.toBase58()}`);
      const listData = await listRes.json();
      if (listData.ok) setCollabs(listData.items ?? []);
    } catch (e) {
      toast.error(`Create failed: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <W6AppShell forceSurface="agent">
      <div style={{ maxWidth: 880 }}>
        <div className="text-xs uppercase tracking-wider text-[#52525b]">Collabs</div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Two-tap split payment</h1>
        <p className="mt-2 text-sm text-[#52525b]">
          You + a co-creator. One link. Every payment splits atomically across both
          wallets in a single Solana tx.
        </p>

        {!connected ? (
          <div className="mt-10 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-6 text-sm text-[#52525b]">
            Connect a wallet to create a collab.
          </div>
        ) : (
          <section className="mt-8 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
            <h2 className="text-sm font-medium">Create a new collab</h2>
            <div className="mt-4 grid gap-3 text-sm">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Label, e.g. 'Pixar tee — 50/50'"
                className="rounded-lg border border-[#e4e4e7] bg-transparent px-4 py-2 outline-none focus:border-accent"
              />
              <input
                value={creatorB}
                onChange={(e) => setCreatorB(e.target.value)}
                placeholder="Creator B pubkey (Solana address)"
                className="rounded-lg border border-[#e4e4e7] bg-transparent px-4 py-2 font-mono text-xs outline-none focus:border-accent"
              />
              <div>
                <div className="flex items-baseline justify-between text-xs text-[#52525b]">
                  <span>Your share</span>
                  <span className="font-mono">
                    {ratioA}% / {100 - ratioA}%
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={99}
                  step={1}
                  value={ratioA}
                  onChange={(e) => setRatioA(Number(e.target.value))}
                  className="mt-2 w-full accent-accent"
                />
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                maxLength={280}
                className="rounded-lg border border-[#e4e4e7] bg-transparent px-4 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <button
              type="button"
              onClick={() => void create()}
              disabled={submitting}
              className="mt-4 w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create collab"}
            </button>
          </section>
        )}

        <h2 className="mt-12 text-sm font-medium">Your collabs</h2>
        {loading ? (
          <div className="mt-3 h-20 animate-pulse rounded-2xl border border-[#e4e4e7] bg-[#fafafa]" />
        ) : collabs.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5 text-sm text-[#52525b]">
            None yet.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {collabs.map((c) => {
              const ratioAPct = c.ratio_bps_a / 100;
              return (
                <li key={c.id}>
                  <Link
                    href={`/collab/${c.id}`}
                    className="flex items-center justify-between rounded-xl border border-[#e4e4e7] p-4 hover:bg-[#fafafa]"
                  >
                    <div>
                      <div className="text-sm font-medium">{c.label}</div>
                      <div className="mt-0.5 text-[11px] text-[#71717a]">
                        {ratioAPct}% / {100 - ratioAPct}% with{" "}
                        {c.creator_b_pubkey.slice(0, 6)}…
                      </div>
                    </div>
                    <span className="text-xs text-accent">Open →</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </W6AppShell>
  );
}
