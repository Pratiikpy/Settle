"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { formatUsdc } from "@settle/sdk";
import { W6AppShell } from "../../components/w6-app-shell";
import { LocaleSwitcher } from "../../components/locale-switcher";
import { useTranslate } from "../../lib/i18n";

/**
 * /allowances — F7.9 parent ↔ kid recurring funding.
 *
 * Two views, switched by which side of the relationship the connected
 * wallet is on:
 *   - Parent: list allowances I'm paying, create new ones, delete.
 *   - Kid: list allowances I'm receiving, see next fund time.
 *
 * Each allowance has a linked scheduled_send (created server-side on
 * POST). The signer cron fires it weekly via spend_via_pact, same as
 * any other recurring schedule. Parent must spawn a Pact for the
 * underlying schedule on /wishes before firing kicks in — we surface
 * a deeplink to that flow.
 */

interface Allowance {
  allowance_id: string;
  parent_pubkey: string;
  kid_pubkey: string;
  kid_card: string | null;
  weekly_lamports: string;
  daily_cap_lamports: string;
  enabled: boolean;
  last_funded_at: string | null;
  created_at: string;
  schedule_id?: string | null;
}

interface DelegatedCard {
  card_pubkey: string;
  label: string;
  daily_cap_lamports: string;
}

export default function AllowancesPage() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { t } = useTranslate();
  const owner = publicKey?.toBase58() ?? "";

  // C117 — kid card spawn busy state, keyed by allowance_id so multiple
  // pending spawns can have independent spinners.
  const [spawningKidCard, setSpawningKidCard] = useState<Record<string, boolean>>(
    {},
  );

  const [view, setView] = useState<"parent" | "kid">("parent");
  const [paying, setPaying] = useState<Allowance[]>([]);
  const [receiving, setReceiving] = useState<Allowance[]>([]);
  const [delegatedCards, setDelegatedCards] = useState<DelegatedCard[]>([]);
  const [selectedCard, setSelectedCard] = useState("");
  const [busy, setBusy] = useState(false);

  // Form state
  const [kid, setKid] = useState("");
  const [weeklyUsdc, setWeeklyUsdc] = useState("20.00");
  const [dailyCapUsdc, setDailyCapUsdc] = useState("5.00");
  const [time, setTime] = useState("12:00");

  async function reload() {
    if (!owner) return;
    const [parentRes, kidRes, cardsRes] = await Promise.all([
      fetch(`/api/allowances?parent=${owner}`).then((r) => r.json()),
      fetch(`/api/allowances?kid=${owner}`).then((r) => r.json()),
      fetch(`/api/cards/delegated?owner=${owner}`).then((r) => r.json()),
    ]);
    setPaying(parentRes.allowances ?? []);
    setReceiving(kidRes.allowances ?? []);
    setDelegatedCards(cardsRes.delegated_cards ?? []);
    if (!selectedCard && cardsRes.delegated_cards?.[0]) {
      setSelectedCard(cardsRes.delegated_cards[0].card_pubkey);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  function lamports(usdc: string): string | null {
    const n = parseFloat(usdc);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 1_000_000).toString();
  }

  async function createAllowance() {
    if (!owner) return toast.error("Connect wallet first.");
    const w = lamports(weeklyUsdc);
    const d = lamports(dailyCapUsdc);
    if (!w || !d || !kid) {
      return toast.error("Kid pubkey + weekly + daily cap required.");
    }
    if (BigInt(d) > BigInt(w)) {
      return toast.error("Daily cap can't exceed weekly amount.");
    }
    setBusy(true);
    try {
      const res = await fetch("/api/allowances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parent_pubkey: owner,
          kid_pubkey: kid,
          weekly_lamports: w,
          daily_cap_lamports: d,
          parent_card_pubkey: selectedCard || undefined,
          time_of_day: time,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "create_failed");
      }
      const j = (await res.json()) as { hint?: string };
      toast.success(
        `Allowance created. ${j.hint ?? "Cron will fire weekly."}`,
      );
      setKid("");
      await reload();
    } catch (e) {
      toast.error(`Create failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteAllowance(a: Allowance) {
    if (!owner) return;
    setBusy(true);
    try {
      const res = await fetch("/api/allowances", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowance_id: a.allowance_id,
          parent_pubkey: owner,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "delete_failed");
      }
      toast.success("Allowance + linked schedule deleted.");
      await reload();
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  /**
   * C117 — Kid spawns their cap-enforced spending card.
   *
   * Two-phase: server builds an unsigned create_card tx (kid as agent
   * + authority), kid signs in their wallet, then client posts to
   * /attach-kid-card to bind the card_pubkey on the allowance row.
   */
  async function spawnKidCard(a: Allowance) {
    if (!owner || !signTransaction) {
      return toast.error("Connect your kid wallet first.");
    }
    if (a.kid_pubkey !== owner) {
      return toast.error(
        "Connected wallet doesn't match the allowance's kid_pubkey.",
      );
    }
    setSpawningKidCard({ ...spawningKidCard, [a.allowance_id]: true });
    try {
      const buildRes = await fetch("/api/allowances/spawn-kid-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowance_id: a.allowance_id,
          kid_authority: owner,
        }),
      });
      if (!buildRes.ok) {
        const err = await buildRes.json();
        throw new Error(err.error ?? `build_failed_${buildRes.status}`);
      }
      const { transaction, kid_card, daily_cap_usdc } =
        (await buildRes.json()) as {
          transaction: string;
          kid_card: string;
          daily_cap_usdc: string;
        };

      toast.message(
        `Spawning your spending card with $${daily_cap_usdc}/day cap. Sign in your wallet.`,
      );
      const tx = Transaction.from(Buffer.from(transaction, "base64"));
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: tx.recentBlockhash!,
          lastValidBlockHeight: tx.lastValidBlockHeight!,
        },
        "confirmed",
      );

      const attachRes = await fetch("/api/allowances/attach-kid-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allowance_id: a.allowance_id,
          kid_pubkey: owner,
          kid_card,
          signature: sig,
        }),
      });
      if (!attachRes.ok) {
        toast.error("Card spawned on-chain but attach failed. Refresh.");
        return;
      }
      toast.success(`Kid card spawned. Daily cap $${daily_cap_usdc} USDC.`);
      await reload();
    } catch (e) {
      toast.error(`Spawn failed: ${(e as Error).message}`);
    } finally {
      setSpawningKidCard({ ...spawningKidCard, [a.allowance_id]: false });
    }
  }

  return (
    <W6AppShell>
      <div>
        <header
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 24,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="w6-eyebrow" style={{ fontSize: 12 }}>
              Schedule
            </div>
            <h1
              className="w6-heading"
              style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.1 }}
            >
              {t("allowances.title")}
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
              {t("allowances.subtitle")}
            </p>
          </div>
          <LocaleSwitcher />
        </header>

        {!connected ? (
          <p className="text-sm text-[#52525b]">Connect wallet to begin.</p>
        ) : (
          <>
            <nav
              style={{
                display: "flex",
                gap: 6,
                marginBottom: 18,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => setView("parent")}
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 999,
                  border: `1px solid ${view === "parent" ? "var(--w6-ink)" : "var(--w6-rule)"}`,
                  background: view === "parent" ? "var(--w6-ink)" : "#fff",
                  color: view === "parent" ? "#fff" : "var(--w6-ink-2)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                I&rsquo;m paying ({paying.length})
              </button>
              <button
                type="button"
                onClick={() => setView("kid")}
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 999,
                  border: `1px solid ${view === "kid" ? "var(--w6-ink)" : "var(--w6-rule)"}`,
                  background: view === "kid" ? "var(--w6-ink)" : "#fff",
                  color: view === "kid" ? "#fff" : "var(--w6-ink-2)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                I'm receiving ({receiving.length})
              </button>
            </nav>

            {/* Parent view */}
            {view === "parent" && (
              <>
                {delegatedCards.length === 0 ? (
                  <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4 text-xs text-amber-200">
                    No delegated card yet. Allowances need one to fire.{" "}
                    <Link
                      href="/settings/relayer"
                      className="underline hover:text-amber-100"
                    >
                      Set up delegation →
                    </Link>
                  </div>
                ) : (
                  <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.03] p-4">
                    <label className="block text-[11px] uppercase tracking-wide text-emerald-400/70">
                      Funding card
                    </label>
                    <select
                      value={selectedCard}
                      onChange={(e) => setSelectedCard(e.target.value)}
                      className="mt-2 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                    >
                      {delegatedCards.map((c) => (
                        <option key={c.card_pubkey} value={c.card_pubkey}>
                          {c.label} · cap{" "}
                          {(Number(c.daily_cap_lamports) / 1e6).toFixed(2)} ·{" "}
                          {c.card_pubkey.slice(0, 6)}…
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <section className="mb-6 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5">
                  <h2 className="text-sm font-medium">New allowance</h2>
                  <div className="mt-3 grid gap-3">
                    <input
                      placeholder="Kid pubkey"
                      value={kid}
                      onChange={(e) => setKid(e.target.value)}
                      className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#71717a]">
                          Weekly USDC
                        </p>
                        <input
                          value={weeklyUsdc}
                          onChange={(e) => setWeeklyUsdc(e.target.value)}
                          inputMode="decimal"
                          className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#71717a]">
                          Daily cap
                        </p>
                        <input
                          value={dailyCapUsdc}
                          onChange={(e) => setDailyCapUsdc(e.target.value)}
                          inputMode="decimal"
                          className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[#71717a]">
                          Time UTC
                        </p>
                        <input
                          type="time"
                          value={time}
                          onChange={(e) => setTime(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <button
                      onClick={createAllowance}
                      disabled={busy || !kid}
                      className="rounded-full bg-accent py-2 text-xs font-medium text-background disabled:opacity-50"
                    >
                      {busy ? "Creating…" : "Create allowance"}
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] text-[#71717a]">
                    A weekly scheduled_send fires every Sunday. After creating,
                    spawn a Pact on{" "}
                    <Link href="/wishes" className="text-accent hover:underline">
                      /wishes
                    </Link>{" "}
                    to fund the year ahead.
                  </p>
                </section>

                <ul className="space-y-2">
                  {paying.map((a) => (
                    <li
                      key={a.allowance_id}
                      className="rounded-xl border border-[#e4e4e7] bg-white/[0.02] p-4 text-xs"
                    >
                      <div className="flex items-baseline justify-between">
                        <div>
                          <strong>
                            {formatUsdc(a.weekly_lamports)}/week
                          </strong>{" "}
                          → <code className="text-[#52525b]">
                            {a.kid_pubkey.slice(0, 6)}…{a.kid_pubkey.slice(-4)}
                          </code>
                        </div>
                        <button
                          onClick={() => deleteAllowance(a)}
                          disabled={busy}
                          className="text-[#71717a] hover:text-red-400 disabled:opacity-50"
                        >
                          delete
                        </button>
                      </div>
                      <div className="mt-1 text-[#52525b]">
                        daily cap {formatUsdc(a.daily_cap_lamports)}{" "}
                        {a.last_funded_at && (
                          <>
                            · last funded{" "}
                            {new Date(a.last_funded_at).toLocaleDateString()}
                          </>
                        )}
                      </div>
                      {a.schedule_id && (
                        <p className="mt-2 text-[10px] text-[#71717a]">
                          schedule {a.schedule_id.slice(0, 8)}… · check
                          firings on{" "}
                          <Link
                            href="/audit"
                            className="text-accent/70 hover:underline"
                          >
                            /audit
                          </Link>
                        </p>
                      )}
                    </li>
                  ))}
                  {paying.length === 0 && (
                    <p className="text-xs text-[#71717a]">
                      No allowances yet.
                    </p>
                  )}
                </ul>
              </>
            )}

            {/* Kid view */}
            {view === "kid" && (
              <ul className="space-y-2">
                {receiving.map((a) => (
                  <li
                    key={a.allowance_id}
                    className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.03] p-4 text-xs"
                  >
                    <div className="flex items-baseline justify-between">
                      <div>
                        <strong>{formatUsdc(a.weekly_lamports)}/week</strong>{" "}
                        from{" "}
                        <code className="text-[#52525b]">
                          {a.parent_pubkey.slice(0, 6)}…{a.parent_pubkey.slice(-4)}
                        </code>
                      </div>
                      <span
                        className={`text-[10px] uppercase tracking-wide ${
                          a.enabled ? "text-emerald-300" : "text-[#71717a]"
                        }`}
                      >
                        {a.enabled ? "active" : "paused"}
                      </span>
                    </div>
                    <div className="mt-1 text-[#52525b]">
                      daily spend cap {formatUsdc(a.daily_cap_lamports)}
                    </div>
                    {a.last_funded_at && (
                      <p className="mt-1 text-[10px] text-[#71717a]">
                        last funded{" "}
                        {new Date(a.last_funded_at).toLocaleString()}
                      </p>
                    )}

                    {/* C117 — kid card status. If spawned, show card pubkey
                        + cap-active badge. If not, offer the spawn button. */}
                    {a.kid_card ? (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/[0.05] px-3 py-1 text-[10px] text-emerald-300">
                        <span>✓ spending card active</span>
                        <code className="text-emerald-300/70">
                          {a.kid_card.slice(0, 6)}…{a.kid_card.slice(-4)}
                        </code>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/[0.04] p-3">
                        <p className="text-[11px] text-amber-200">
                          Your parent set up the allowance, but you haven&apos;t
                          spawned your spending card yet. Without it, the
                          daily cap isn&apos;t enforced on-chain.
                        </p>
                        <button
                          onClick={() => spawnKidCard(a)}
                          disabled={spawningKidCard[a.allowance_id] || !connected}
                          className="mt-2 rounded-full bg-accent px-3 py-1 text-[11px] font-medium text-background disabled:opacity-50"
                        >
                          {spawningKidCard[a.allowance_id]
                            ? "Spawning…"
                            : "Spawn my spending card"}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
                {receiving.length === 0 && (
                  <p className="text-xs text-[#71717a]">
                    No incoming allowances.
                  </p>
                )}
              </ul>
            )}
          </>
        )}
      </div>
    </W6AppShell>
  );
}
