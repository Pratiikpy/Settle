"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { W6AppShell } from "../../../../components/w6-app-shell";

/**
 * /admin/federation/origins — operator promotes / demotes federation
 * origins. Promoting an origin retroactively flips its untrusted rows
 * to verified, so they appear in /ledger immediately for users.
 *
 * Auth: paste CRON_SECRET into the field on the page (kept in
 * sessionStorage so refresh doesn't re-prompt). The secret is sent
 * as `Authorization: Bearer ...` to the admin API. We deliberately
 * don't store it in localStorage — sessionStorage clears on tab close.
 */

interface OriginRow {
  origin_id: string;
  label: string;
  attestation_pubkey: string;
  trusted: boolean;
  homepage_url: string | null;
  notes: string | null;
  created_at: string;
  counts: {
    verified: number;
    untrusted: number;
    invalid: number;
  };
}

export default function FederationOriginsPage() {
  const [secret, setSecret] = useState("");
  const [origins, setOrigins] = useState<OriginRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Hydrate from sessionStorage on mount.
  useEffect(() => {
    const stored = sessionStorage.getItem("settle:cron-secret");
    if (stored) setSecret(stored);
  }, []);

  async function load(secretToUse: string) {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/federation/origins", {
        headers: { Authorization: `Bearer ${secretToUse}` },
      });
      if (r.status === 401) {
        setError("CRON_SECRET rejected. Check your value.");
        setOrigins([]);
        return;
      }
      if (!r.ok) {
        setError(`HTTP ${r.status}`);
        setOrigins([]);
        return;
      }
      const j = (await r.json()) as { origins: OriginRow[] };
      setOrigins(j.origins);
      sessionStorage.setItem("settle:cron-secret", secretToUse);
    } catch (e) {
      setError(`Network error: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  async function toggle(o: OriginRow) {
    if (!secret) return toast.error("Paste the secret first.");
    setBusy({ ...busy, [o.origin_id]: true });
    try {
      const r = await fetch("/api/admin/federation/origins", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          origin_id: o.origin_id,
          trusted: !o.trusted,
        }),
      });
      if (!r.ok) {
        const err = await r.json();
        throw new Error(err.error ?? "patch_failed");
      }
      toast.success(
        o.trusted
          ? `${o.origin_id} demoted. Verified receipts flipped to untrusted.`
          : `${o.origin_id} promoted. Untrusted receipts now show in /ledger.`,
      );
      await load(secret);
    } catch (e) {
      toast.error(`Toggle failed: ${(e as Error).message}`);
    } finally {
      setBusy({ ...busy, [o.origin_id]: false });
    }
  }

  return (
    <W6AppShell forceSurface="operator">
      <div style={{ maxWidth: 880 }}>
        <header style={{ marginBottom: 32 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Operator · federation
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Federation origins
          </h1>
          <p
            className="w6-muted"
            style={{
              fontSize: 14,
              marginTop: 8,
              maxWidth: 720,
              lineHeight: 1.5,
            }}
          >
            Operator-only. Promote a foreign origin&apos;s attestation key
            to trusted; its verified receipts then surface in /ledger.
            Demote to hide them again. The receipts stay in the DB either
            way — only the trust gate moves.
          </p>
        </header>

        <section className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/[0.04] p-4">
          <p className="text-[11px] uppercase tracking-wide text-amber-300/70">
            CRON_SECRET
          </p>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Paste the operator secret"
            className="mt-2 w-full rounded-lg border border-foreground/10 bg-transparent px-3 py-2 font-mono text-sm"
          />
          <button
            onClick={() => load(secret)}
            disabled={!secret || loading}
            className="mt-3 rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-background disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load origins"}
          </button>
        </section>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-400/[0.04] p-4 text-xs text-red-200">
            {error}
          </div>
        )}

        {origins.length > 0 && (
          <ul className="space-y-2">
            {origins.map((o) => (
              <li
                key={o.origin_id}
                className={`rounded-2xl border p-4 text-xs ${
                  o.trusted
                    ? "border-emerald-400/30 bg-emerald-400/[0.03]"
                    : "border-foreground/10 bg-white/[0.02]"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <strong>{o.label}</strong>
                    <p className="mt-1 text-[10px] text-foreground/50">
                      <code>{o.origin_id}</code>
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                      o.trusted
                        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                        : "border-foreground/20 bg-foreground/5 text-foreground/60"
                    }`}
                  >
                    {o.trusted ? "trusted" : "untrusted"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                  <Pill
                    label="verified"
                    value={o.counts.verified}
                    tone="emerald"
                  />
                  <Pill
                    label="untrusted"
                    value={o.counts.untrusted}
                    tone="neutral"
                  />
                  <Pill
                    label="invalid"
                    value={o.counts.invalid}
                    tone="red"
                  />
                </div>

                <div className="mt-3 text-[10px] text-foreground/50">
                  attestation pubkey:{" "}
                  <code className="break-all">{o.attestation_pubkey}</code>
                </div>
                {o.notes && (
                  <p className="mt-2 text-[11px] text-foreground/60">
                    {o.notes}
                  </p>
                )}

                <button
                  onClick={() => toggle(o)}
                  disabled={busy[o.origin_id]}
                  className={`mt-3 rounded-full px-3 py-1 text-[11px] disabled:opacity-50 ${
                    o.trusted
                      ? "border border-foreground/20 hover:bg-foreground/5"
                      : "bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/25"
                  }`}
                >
                  {busy[o.origin_id]
                    ? "Saving…"
                    : o.trusted
                      ? "Demote to untrusted"
                      : "Promote to trusted"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </W6AppShell>
  );
}

function Pill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "neutral" | "red";
}) {
  const cls = {
    emerald: "border-emerald-400/30 text-emerald-200",
    neutral: "border-foreground/15 text-foreground/60",
    red: "border-red-400/30 text-red-200",
  }[tone];
  return (
    <div className={`rounded-lg border bg-white/[0.02] p-2 ${cls}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 text-sm">{value.toLocaleString()}</p>
    </div>
  );
}
