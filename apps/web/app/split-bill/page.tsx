"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import { W6AppShell } from "../../components/w6-app-shell";
import { asAuthHeaders, fetchAuthHeaders } from "../../lib/client-auth";

/**
 * F21 — Split-bill organizer page.
 *
 * Wallet-sig-auth POST creates the bill on the server (RLS pins organizer = wallet).
 * The freshly-created bill ID redirects to /split-bill/[id], which is shareable to all
 * payers. Each payer pays exactly per_payer_lamports = ceil(target / n_payers).
 */
export default function SplitBillCreatePage() {
  const { connected, publicKey, signMessage } = useWallet();
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [totalUsd, setTotalUsd] = useState("");
  const [nPayers, setNPayers] = useState(2);
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!connected || !publicKey || !signMessage) {
      toast.error("Connect Phantom first.");
      return;
    }
    const total = parseFloat(totalUsd);
    if (!Number.isFinite(total) || total <= 0) {
      toast.error("Enter a valid target total.");
      return;
    }
    if (!label.trim()) {
      toast.error("Add a label so payers know what they're paying for.");
      return;
    }
    setBusy(true);
    try {
      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      const r = await fetch("/api/split-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...asAuthHeaders(auth) },
        body: JSON.stringify({
          label,
          target_total_lamports: String(Math.round(total * 1_000_000)),
          n_payers: nPayers,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.message ?? d.error ?? "create_failed");
      toast.success("Bill created.");
      router.push(`/split-bill/${d.id}`);
    } catch (e) {
      toast.error(`Create failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const perPayer = (() => {
    const total = parseFloat(totalUsd);
    if (!Number.isFinite(total) || total <= 0) return null;
    const n = Math.max(2, Math.min(50, nPayers));
    // Mirror server's ceiling-divide for accurate preview.
    const lamports = Math.ceil((Math.round(total * 1_000_000) + n - 1) / n);
    return lamports / 1_000_000;
  })();

  return (
    <W6AppShell>
      <div style={{ maxWidth: 560 }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>
          Tools · Split bill
        </div>
        <h1
          className="w6-heading"
          style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.1 }}
        >
          Split it N ways
        </h1>
        <p
          className="w6-muted"
          style={{
            fontSize: 14,
            marginTop: 8,
            maxWidth: 640,
            lineHeight: 1.5,
            marginBottom: 24,
          }}
        >
          Pick a total and number of payers. Share the link. Bill closes on
          its own when the last payer settles.
        </p>

        {!connected ? (
          <div
            className="w6-card"
            style={{ padding: 32, textAlign: "center" }}
          >
            <p className="w6-muted" style={{ fontSize: 14 }}>
              Connect a wallet to organize a split.
            </p>
          </div>
        ) : (
          <section className="w6-card" style={{ padding: 24 }}>
            <div className="grid gap-3 text-sm">
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="What's this for? e.g. Friday dinner"
                className="rounded-lg border border-foreground/15 bg-transparent px-4 py-2 outline-none focus:border-accent"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={totalUsd}
                  onChange={(e) => setTotalUsd(e.target.value)}
                  placeholder="Total ($)"
                  inputMode="decimal"
                  className="rounded-lg border border-foreground/15 bg-transparent px-4 py-2 outline-none focus:border-accent"
                />
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={nPayers}
                  onChange={(e) => setNPayers(Math.max(2, Math.min(50, Number(e.target.value))))}
                  className="rounded-lg border border-foreground/15 bg-transparent px-4 py-2 outline-none focus:border-accent"
                />
              </div>
              {perPayer !== null && (
                <div className="text-xs text-foreground/50">
                  Each payer sends <span className="font-mono text-foreground/80">${perPayer.toFixed(2)}</span>{" "}
                  (last payer absorbs any rounding).
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void create()}
              disabled={busy}
              className="w6-btn w6-btn-primary"
              style={{ width: "100%", marginTop: 16 }}
            >
              {busy ? "Creating…" : "Create bill"}
            </button>
          </section>
        )}
      </div>
    </W6AppShell>
  );
}
