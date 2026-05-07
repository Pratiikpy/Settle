"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { formatUsdc } from "@settle/sdk";
import { W6AppShell } from "../../components/w6-app-shell";
import { LocaleSwitcher } from "../../components/locale-switcher";
import { useTranslate } from "../../lib/i18n";
import { fetchAuthHeaders, asAuthHeaders } from "../../lib/client-auth";

/**
 * F7.3 + F7.5 + F7.6 + F7.10 — "Wishes" page.
 *
 * Single-screen consumer hub for the four declarative-rule features that
 * Phase 5 ships first: scheduled sends, save-for buckets, round-up, and
 * gift sends. We deliberately don't surface group accounts + allowances
 * here yet — those have their own deeper UIs at /groups and /allowances
 * (next milestone) because they need member management.
 *
 * Why call it "Wishes": every feature here is a "what I WANT to happen"
 * declaration — "I wish this $20 would auto-send to rent on the 1st",
 * "I wish round-ups would land in my AWS savings". Calling them all
 * "rules" or "automations" felt sterile; "wishes" is closer to the
 * mental model.
 */

type Cadence = "DAILY" | "WEEKLY" | "MONTHLY";

interface Schedule {
  schedule_id: string;
  dest_pubkey: string;
  amount_lamports: string;
  cadence: Cadence;
  day_of_period: number | null;
  time_of_day: string;
  note: string | null;
  enabled: boolean;
  next_fire_at: string | null;
  card_pubkey?: string | null;
  pact_pubkey?: string | null;
}

interface Bucket {
  bucket_id: string;
  label: string;
  target_lamports: string;
  category: string;
  holding_card: string | null;
  completed_at: string | null;
}

interface RoundUpRule {
  rule_id: string;
  round_to_lamports: string;
  dest_pubkey: string;
  daily_cap_lamports: string | null;
  enabled: boolean;
}

interface Gift {
  gift_id: string;
  recipient_handle: string;
  amount_lamports: string;
  note: string | null;
  status: string;
  expires_at: string;
  pact_pubkey?: string | null;
  claimer_pubkey?: string | null;
}

const ROUND_PRESETS: Array<{ value: string; label: string }> = [
  { value: "100000", label: "$0.10" },
  { value: "500000", label: "$0.50" },
  { value: "1000000", label: "$1" },
  { value: "5000000", label: "$5" },
];

export default function WishesPage() {
  const { connected, publicKey, signTransaction, signMessage } = useWallet();
  const { connection } = useConnection();
  const { t } = useTranslate();
  const owner = publicKey?.toBase58() ?? "";

  const [tab, setTab] = useState<"schedule" | "save" | "roundup" | "gift">("schedule");

  // Scheduled sends.
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [schedDest, setSchedDest] = useState("");
  const [schedAmount, setSchedAmount] = useState("");
  const [schedCadence, setSchedCadence] = useState<Cadence>("MONTHLY");
  const [schedDay, setSchedDay] = useState<number>(1);
  const [schedTime, setSchedTime] = useState<string>("12:00");
  const [schedNote, setSchedNote] = useState("");

  // Save-for buckets.
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [bucketLabel, setBucketLabel] = useState("");
  const [bucketTarget, setBucketTarget] = useState("");
  const [bucketCat, setBucketCat] = useState<"ai" | "rent" | "vacation" | "bills" | "other">(
    "other",
  );

  // Round-up.
  const [roundRule, setRoundRule] = useState<RoundUpRule | null>(null);
  const [roundChoice, setRoundChoice] = useState<string>("1000000");
  const [roundDest, setRoundDest] = useState("");

  // Gift sends.
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [giftHandle, setGiftHandle] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftEscrow, setGiftEscrow] = useState("");
  const [giftNote, setGiftNote] = useState("");

  // Delegated cards (agent_pubkey == relayer). Required for Phase 5
  // automation to actually fire on-chain. If the user has none, we
  // surface a banner steering them to /settings/relayer.
  const [delegatedCards, setDelegatedCards] = useState<
    Array<{ card_pubkey: string; label: string; daily_cap_lamports: string }>
  >([]);
  const [relayerConfigured, setRelayerConfigured] = useState<boolean | null>(null);
  const [selectedCard, setSelectedCard] = useState<string>("");

  // ─── load on connect ───
  useEffect(() => {
    if (!owner) return;
    void Promise.all([
      fetch(`/api/scheduled-sends?owner=${owner}`).then((r) => r.json()),
      fetch(`/api/save-for?owner=${owner}`).then((r) => r.json()),
      fetch(`/api/round-up?owner=${owner}`).then((r) => r.json()),
      fetch(`/api/gift-sends?owner=${owner}`).then((r) => r.json()),
      fetch(`/api/cards/delegated?owner=${owner}`).then((r) => r.json()),
    ]).then(([s, b, r, g, d]) => {
      setSchedules(s.schedules ?? []);
      setBuckets(b.buckets ?? []);
      setRoundRule(r.rule ?? null);
      setGifts(g.gifts ?? []);
      setDelegatedCards(d.delegated_cards ?? []);
      setRelayerConfigured(Boolean(d.relayer_configured));
      const first = (d.delegated_cards ?? [])[0];
      if (first && !selectedCard) setSelectedCard(first.card_pubkey);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner]);

  const lamports = (usdc: string) => {
    const n = Number(usdc);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n * 1_000_000).toString();
  };

  const tabClass = (t: typeof tab) => {
    const on = tab === t;
    return on ? "w6-tab w6-tab-on" : "w6-tab";
  };

  const tabStyle = (t: typeof tab): React.CSSProperties => {
    const on = tab === t;
    return {
      height: 30,
      padding: "0 12px",
      borderRadius: 999,
      border: `1px solid ${on ? "var(--w6-ink)" : "var(--w6-rule)"}`,
      background: on ? "var(--w6-ink)" : "#fff",
      color: on ? "#fff" : "var(--w6-ink-2)",
      fontSize: 12,
      fontWeight: 500,
      cursor: "pointer",
    };
  };

  const totalAutomatedMonthly = useMemo(() => {
    const lamps = schedules
      .filter((s) => s.enabled)
      .reduce((acc, s) => {
        const amt = BigInt(s.amount_lamports);
        if (s.cadence === "DAILY") return acc + amt * 30n;
        if (s.cadence === "WEEKLY") return acc + amt * 4n;
        return acc + amt;
      }, 0n);
    return formatUsdc(lamps);
  }, [schedules]);

  // ─── handlers ───
  async function createSchedule() {
    if (!owner) return;
    const lamp = lamports(schedAmount);
    if (!lamp) return toast.error("Enter a valid USDC amount.");
    if (!schedDest) return toast.error("Recipient pubkey required.");
    if (!signMessage) return toast.error("Connect wallet first.");
    let auth;
    try {
      auth = await fetchAuthHeaders(owner, signMessage);
    } catch {
      return toast.error("Wallet signature required.");
    }
    const res = await fetch("/api/scheduled-sends", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...asAuthHeaders(auth) },
      body: JSON.stringify({
        owner_pubkey: owner,
        // Attach a delegated card if one is selected — without this the
        // signer cron has nothing to spend FROM and the wish stays a
        // wish forever. With it, the relayer can fire within the card's
        // daily_cap.
        ...(selectedCard ? { card_pubkey: selectedCard } : {}),
        dest_pubkey: schedDest,
        amount_lamports: lamp,
        cadence: schedCadence,
        day_of_period: schedCadence === "DAILY" ? undefined : schedDay,
        time_of_day: schedTime,
        note: schedNote || undefined,
      }),
    });
    if (!res.ok) return toast.error("Could not create schedule.");
    const j = await res.json();
    setSchedules([j.schedule, ...schedules]);
    setSchedDest("");
    setSchedAmount("");
    setSchedNote("");
    toast.success("Wish saved.");
  }

  async function deleteSchedule(id: string) {
    if (!signMessage || !owner) return toast.error("Connect wallet first.");
    let auth;
    try {
      auth = await fetchAuthHeaders(owner, signMessage);
    } catch {
      return toast.error("Wallet signature required.");
    }
    await fetch("/api/scheduled-sends", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...asAuthHeaders(auth) },
      body: JSON.stringify({ schedule_id: id, owner_pubkey: owner }),
    });
    setSchedules(schedules.filter((s) => s.schedule_id !== id));
  }

  /**
   * Renew an existing Pact: atomically close the old Pact (recovering
   * any unspent USDC) and open a new one with a fresh cap. After
   * confirmation we rebind the schedule to the new PDA. Both ops in
   * one signed tx — partial states are not possible.
   */
  async function renewPactForSchedule(s: Schedule) {
    if (!owner || !signTransaction || !s.pact_pubkey) {
      return toast.error(
        s.pact_pubkey
          ? "Connect wallet first."
          : "No existing Pact to renew — use Spawn Pact instead.",
      );
    }
    const additionalPeriods = 12;
    try {
      const buildRes = await fetch("/api/scheduled-sends/topup-pact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: s.schedule_id,
          authority: owner,
          additional_periods: additionalPeriods,
        }),
      });
      if (!buildRes.ok) {
        const err = await buildRes.json();
        throw new Error(err.error ?? `build_failed_${buildRes.status}`);
      }
      const { transaction, new_pact_pubkey, new_cap_usdc } =
        (await buildRes.json()) as {
          transaction: string;
          new_pact_pubkey: string;
          new_cap_usdc: string;
        };
      toast.message(
        `Renewing Pact: close old + open new with $${new_cap_usdc} cap. Sign once.`,
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
          lastValidBlockHeight: tx.lastValidBlockHeight ?? (await connection.getBlockHeight()) + 150,
        },
        "confirmed",
      );
      // replace_existing=true is critical here — the schedule already
      // has a pact_pubkey (the old one we just closed); we need to
      // overwrite with the new PDA.
      const attachRes = await fetch("/api/scheduled-sends/attach-pact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: s.schedule_id,
          owner_pubkey: owner,
          pact_pubkey: new_pact_pubkey,
          replace_existing: true,
          signature: sig,
        }),
      });
      if (!attachRes.ok) {
        toast.error("New Pact spawned on-chain but attach failed. Refresh.");
        return;
      }
      setSchedules(
        schedules.map((row) =>
          row.schedule_id === s.schedule_id
            ? { ...row, pact_pubkey: new_pact_pubkey }
            : row,
        ),
      );
      toast.success(
        `Pact renewed with $${new_cap_usdc} USDC. Wishes will keep firing.`,
      );
    } catch (e) {
      toast.error(`Pact renewal failed: ${(e as Error).message}`);
    }
  }

  /**
   * Spawn a Pact pre-funded with `periods_to_fund × amount`. The Pact
   * carries the destination pubkey on its allowlist; the relayer can
   * spend ONLY to that destination, capped at the funded amount, even
   * if compromised. After confirmation we attach the Pact to the
   * schedule so the signer cron picks it up.
   */
  async function spawnPactForSchedule(s: Schedule) {
    if (!owner || !signTransaction) {
      return toast.error("Connect wallet first.");
    }
    // Default funding: 12 cycles. Future: ask the user.
    const periodsToFund = 12;
    try {
      const buildRes = await fetch("/api/scheduled-sends/spawn-pact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: s.schedule_id,
          authority: owner,
          periods_to_fund: periodsToFund,
        }),
      });
      if (!buildRes.ok) {
        const err = await buildRes.json();
        throw new Error(err.error ?? `build_failed_${buildRes.status}`);
      }
      const { transaction, pact_pubkey, cap_usdc } = (await buildRes.json()) as {
        transaction: string;
        pact_pubkey: string;
        cap_usdc: string;
      };
      toast.message(`Spawning Pact: cap $${cap_usdc} USDC. Sign in your wallet.`);
      const tx = Transaction.from(Buffer.from(transaction, "base64"));
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: tx.recentBlockhash!,
          lastValidBlockHeight: tx.lastValidBlockHeight ?? (await connection.getBlockHeight()) + 150,
        },
        "confirmed",
      );
      // Attach pact_pubkey to the schedule so the signer can use it.
      const attachRes = await fetch("/api/scheduled-sends/attach-pact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule_id: s.schedule_id,
          owner_pubkey: owner,
          pact_pubkey,
          signature: sig,
        }),
      });
      if (!attachRes.ok) {
        toast.error("Pact spawned on-chain but attach failed. Refresh to retry.");
        return;
      }
      setSchedules(
        schedules.map((row) =>
          row.schedule_id === s.schedule_id ? { ...row, pact_pubkey } : row,
        ),
      );
      toast.success(`Pact funded with $${cap_usdc} USDC. Wishes will fire on cadence.`);
    } catch (e) {
      toast.error(`Pact spawn failed: ${(e as Error).message}`);
    }
  }

  async function spawnPactForGift(g: Gift) {
    if (!owner || !signTransaction) {
      return toast.error("Connect wallet first.");
    }
    if (!g.claimer_pubkey) {
      return toast.error("Recipient hasn't claimed yet — Pact can't be allowlisted until they sign.");
    }
    try {
      const buildRes = await fetch("/api/gift-sends/spawn-pact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gift_id: g.gift_id, authority: owner }),
      });
      if (!buildRes.ok) {
        const err = await buildRes.json();
        throw new Error(err.error ?? `build_failed_${buildRes.status}`);
      }
      const { transaction, pact_pubkey, cap_usdc } = (await buildRes.json()) as {
        transaction: string;
        pact_pubkey: string;
        cap_usdc: string;
      };
      toast.message(`Spawning gift Pact: cap $${cap_usdc} USDC. Sign to fund.`);
      const tx = Transaction.from(Buffer.from(transaction, "base64"));
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: tx.recentBlockhash!,
          lastValidBlockHeight: tx.lastValidBlockHeight ?? (await connection.getBlockHeight()) + 150,
        },
        "confirmed",
      );
      const attachRes = await fetch("/api/gift-sends/attach-pact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gift_id: g.gift_id,
          sender_pubkey: owner,
          pact_pubkey,
          signature: sig,
        }),
      });
      if (!attachRes.ok) {
        toast.error("Pact spawned on-chain but attach failed. Refresh to retry.");
        return;
      }
      setGifts(
        gifts.map((row) =>
          row.gift_id === g.gift_id ? { ...row, pact_pubkey } : row,
        ),
      );
      toast.success(`Gift funded with $${cap_usdc} USDC. Relayer will fulfill on cron tick.`);
    } catch (e) {
      toast.error(`Gift Pact spawn failed: ${(e as Error).message}`);
    }
  }

  async function createBucket() {
    const lamp = lamports(bucketTarget);
    if (!lamp || !bucketLabel) return toast.error("Label + target required.");
    if (!signMessage || !owner) return toast.error("Connect wallet first.");
    let auth;
    try {
      auth = await fetchAuthHeaders(owner, signMessage);
    } catch {
      return toast.error("Wallet signature required to create a bucket.");
    }
    const res = await fetch("/api/save-for", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...asAuthHeaders(auth) },
      body: JSON.stringify({
        owner_pubkey: owner,
        label: bucketLabel,
        target_lamports: lamp,
        category: bucketCat,
      }),
    });
    if (!res.ok) return toast.error("Could not create bucket.");
    const j = await res.json();
    setBuckets([j.bucket, ...buckets]);
    setBucketLabel("");
    setBucketTarget("");
    toast.success("Bucket created.");
  }

  async function saveRoundUp() {
    if (!owner || !roundDest) return toast.error("Destination required.");
    if (!signMessage) return toast.error("Connect wallet first.");
    let auth;
    try {
      auth = await fetchAuthHeaders(owner, signMessage);
    } catch {
      return toast.error("Wallet signature required.");
    }
    const res = await fetch("/api/round-up", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...asAuthHeaders(auth) },
      body: JSON.stringify({
        owner_pubkey: owner,
        round_to_lamports: roundChoice,
        dest_pubkey: roundDest,
      }),
    });
    if (!res.ok) return toast.error("Could not save round-up.");
    const j = await res.json();
    setRoundRule(j.rule);
    toast.success("Round-up enabled.");
  }

  async function disableRoundUp() {
    if (!signMessage || !owner) return toast.error("Connect wallet first.");
    let auth;
    try {
      auth = await fetchAuthHeaders(owner, signMessage);
    } catch {
      return toast.error("Wallet signature required.");
    }
    await fetch("/api/round-up", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...asAuthHeaders(auth) },
      body: JSON.stringify({ owner_pubkey: owner }),
    });
    setRoundRule(null);
  }

  async function createGift() {
    const lamp = lamports(giftAmount);
    if (!lamp || !giftHandle || !giftEscrow)
      return toast.error("Handle + amount + escrow card required.");
    if (!signMessage || !owner) return toast.error("Connect wallet first.");
    let auth;
    try {
      auth = await fetchAuthHeaders(owner, signMessage);
    } catch {
      return toast.error("Wallet signature required.");
    }
    const res = await fetch("/api/gift-sends", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...asAuthHeaders(auth) },
      body: JSON.stringify({
        sender_pubkey: owner,
        recipient_handle: giftHandle,
        escrow_card: giftEscrow,
        amount_lamports: lamp,
        note: giftNote || undefined,
      }),
    });
    if (!res.ok) return toast.error("Could not create gift.");
    const j = await res.json();
    setGifts([j.gift, ...gifts]);
    setGiftHandle("");
    setGiftAmount("");
    setGiftNote("");
    toast.success("Gift escrowed.");
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
              Save
            </div>
            <h1
              className="w6-heading"
              style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.1 }}
            >
              {t("wishes.title")}
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
              {t("wishes.subtitle")}
            </p>
          </div>
          <LocaleSwitcher />
        </header>

        {!connected ? (
          <p className="text-sm text-[#52525b]">Connect your wallet to begin.</p>
        ) : (
          <>
            {/* Delegation status banner — wishes need a delegated card or
                they can never fire on-chain. */}
            {relayerConfigured === true && delegatedCards.length === 0 && (
              <div className="mb-6 rounded-2xl border border-amber-400/40 bg-amber-50 p-4 text-xs">
                <p className="text-amber-700">
                  <strong>No delegated card yet.</strong> Wishes you create now
                  will be saved, but they won't fire on-chain until you spawn a
                  card with the Settle relayer as agent.
                </p>
                <a
                  href="/settings/relayer"
                  className="mt-3 inline-block rounded-full border border-amber-600/40 px-4 py-1.5 text-amber-700 hover:bg-amber-100"
                >
                  Set up delegation →
                </a>
              </div>
            )}
            {relayerConfigured === false && (
              <div className="mb-6 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-4 text-xs text-[#52525b]">
                Relayer not configured on this deployment — wishes are stored
                but won't fire automatically.
              </div>
            )}
            {delegatedCards.length > 0 && (
              <div className="mb-6 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.03] p-4 text-xs">
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
                      {(Number(c.daily_cap_lamports) / 1e6).toFixed(2)} USDC ·{" "}
                      {c.card_pubkey.slice(0, 6)}…{c.card_pubkey.slice(-4)}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] text-[#52525b]">
                  Wishes you create are bound to this card. The relayer can
                  spend within its daily cap and allowlist.
                </p>
              </div>
            )}

            <nav
              style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}
            >
              <button
                type="button"
                onClick={() => setTab("save")}
                style={tabStyle("save")}
              >
                Save toward
              </button>
              <button
                type="button"
                onClick={() => setTab("schedule")}
                style={tabStyle("schedule")}
              >
                Schedule
              </button>
              <button
                type="button"
                onClick={() => setTab("roundup")}
                style={tabStyle("roundup")}
              >
                Round-up
              </button>
              <button
                type="button"
                onClick={() => setTab("gift")}
                style={tabStyle("gift")}
              >
                Gifts
              </button>
            </nav>

            {tab === "schedule" && (
              <section>
                <p className="mb-3 text-xs text-[#52525b]">
                  Recurring auto-send. Total queued each month:{" "}
                  <strong className="text-[#09090b]">{totalAutomatedMonthly}</strong>
                </p>
                <div className="grid gap-3 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5">
                  <input
                    placeholder="Recipient pubkey"
                    value={schedDest}
                    onChange={(e) => setSchedDest(e.target.value)}
                    className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      placeholder="USDC"
                      value={schedAmount}
                      onChange={(e) => setSchedAmount(e.target.value)}
                      className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                    />
                    <select
                      value={schedCadence}
                      onChange={(e) => setSchedCadence(e.target.value as Cadence)}
                      className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                    >
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                    </select>
                  </div>
                  {schedCadence !== "DAILY" && (
                    <input
                      type="number"
                      min={schedCadence === "WEEKLY" ? 0 : 1}
                      max={schedCadence === "WEEKLY" ? 6 : 28}
                      value={schedDay}
                      onChange={(e) => setSchedDay(parseInt(e.target.value || "1", 10))}
                      placeholder={schedCadence === "WEEKLY" ? "Day (0=Sun..6=Sat)" : "Day (1-28)"}
                      className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                    />
                  )}
                  <input
                    type="time"
                    value={schedTime}
                    onChange={(e) => setSchedTime(e.target.value)}
                    className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Note (optional)"
                    value={schedNote}
                    onChange={(e) => setSchedNote(e.target.value)}
                    className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                  />
                  <button
                    onClick={createSchedule}
                    className="w6-btn w6-btn-primary w-full"
                  >
                    Save wish
                  </button>
                </div>

                <ul className="mt-6 space-y-2">
                  {schedules.map((s) => (
                    <li
                      key={s.schedule_id}
                      className="rounded-xl border border-[#e4e4e7] bg-white/[0.02] p-4 text-xs"
                    >
                      <div className="flex items-baseline justify-between">
                        <div>
                          <div>
                            <strong>{formatUsdc(s.amount_lamports)}</strong> →{" "}
                            <code className="text-[#52525b]">
                              {s.dest_pubkey.slice(0, 6)}…{s.dest_pubkey.slice(-4)}
                            </code>
                          </div>
                          <div className="text-[#52525b]">
                            {s.cadence}
                            {s.day_of_period !== null ? ` · day ${s.day_of_period}` : ""} ·{" "}
                            {s.time_of_day} UTC{s.note ? ` · ${s.note}` : ""}
                          </div>
                          {s.next_fire_at && (
                            <div className="mt-1 text-[#71717a]">
                              next: {new Date(s.next_fire_at).toLocaleString()}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => deleteSchedule(s.schedule_id)}
                          className="text-[#71717a] hover:text-[#09090b]"
                        >
                          delete
                        </button>
                      </div>

                      {/* Pact-funding state. The signer cron can ONLY fire
                          this rule if a Pact is attached. Surface that
                          gap loud + offer a one-click spawn or renew. */}
                      {s.card_pubkey ? (
                        s.pact_pubkey ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/[0.05] px-3 py-1 text-[11px] text-emerald-300">
                              <span>✓ funded</span>
                              <code className="text-emerald-300/70">
                                {s.pact_pubkey.slice(0, 6)}…{s.pact_pubkey.slice(-4)}
                              </code>
                            </div>
                            <button
                              onClick={() => renewPactForSchedule(s)}
                              className="rounded-full border border-[#a1a1aa] px-3 py-1 text-[11px] text-[#52525b] hover:bg-[#f4f4f5]"
                              title="Close current Pact + open a fresh one with new cap. Atomic."
                            >
                              ↻ Renew
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => spawnPactForSchedule(s)}
                            className="mt-3 rounded-full border border-amber-400/40 bg-amber-400/[0.05] px-3 py-1 text-[11px] text-amber-200 hover:bg-amber-400/10"
                          >
                            ⚠ Spawn Pact to enable firing →
                          </button>
                        )
                      ) : (
                        <p className="mt-3 text-[11px] text-[#71717a]">
                          no card · pick a delegated card above before firing
                        </p>
                      )}
                    </li>
                  ))}
                  {schedules.length === 0 && (
                    <p className="text-xs text-[#71717a]">No scheduled sends yet.</p>
                  )}
                </ul>
              </section>
            )}

            {tab === "save" && (
              <section>
                <div
                  className="w6-card-flat"
                  style={{
                    padding: 16,
                    marginBottom: 24,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr auto",
                    gap: 10,
                  }}
                >
                  <input
                    placeholder="Goal label (e.g. AWS bill)"
                    value={bucketLabel}
                    onChange={(e) => setBucketLabel(e.target.value)}
                    className="w6-input"
                  />
                  <input
                    placeholder="Target USDC"
                    value={bucketTarget}
                    onChange={(e) => setBucketTarget(e.target.value)}
                    inputMode="decimal"
                    className="w6-input"
                  />
                  <select
                    value={bucketCat}
                    onChange={(e) =>
                      setBucketCat(e.target.value as typeof bucketCat)
                    }
                    className="w6-input"
                  >
                    <option value="other">Other</option>
                    <option value="ai">AI bills</option>
                    <option value="rent">Rent</option>
                    <option value="vacation">Vacation</option>
                    <option value="bills">Bills</option>
                  </select>
                  <button
                    type="button"
                    onClick={createBucket}
                    className="w6-btn w6-btn-primary w6-btn-sm"
                  >
                    + New bucket
                  </button>
                </div>

                {buckets.length === 0 ? (
                  <div
                    className="w6-card"
                    style={{ padding: 40, textAlign: "center" }}
                  >
                    <div
                      className="w6-heading"
                      style={{ fontSize: 20, marginBottom: 8 }}
                    >
                      No savings goals yet
                    </div>
                    <p
                      className="w6-muted"
                      style={{
                        fontSize: 13,
                        maxWidth: 480,
                        margin: "0 auto",
                      }}
                    >
                      Named buckets. Each one targets an amount; round-ups,
                      schedules, or manual deposits funnel toward the goal.
                    </p>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr",
                      gap: 16,
                    }}
                    className="w6-buckets-grid"
                  >
                    {buckets.map((b) => {
                      // We don't yet track 'saved' on the bucket — show
                      // the target alongside the holding-card backing.
                      const target = formatUsdc(b.target_lamports);
                      const emoji =
                        b.category === "ai"
                          ? "🤖"
                          : b.category === "rent"
                            ? "🏠"
                            : b.category === "vacation"
                              ? "🌴"
                              : b.category === "bills"
                                ? "🧾"
                                : "💎";
                      return (
                        <div
                          key={b.bucket_id}
                          className="w6-card"
                          style={{ padding: 22 }}
                        >
                          <div style={{ fontSize: 28, marginBottom: 6 }}>
                            {emoji}
                          </div>
                          <div
                            className="w6-heading"
                            style={{ fontSize: 18 }}
                          >
                            {b.label}
                          </div>
                          <div
                            className="w6-muted"
                            style={{ fontSize: 12.5, marginBottom: 16 }}
                          >
                            {b.completed_at
                              ? `completed ${new Date(b.completed_at).toLocaleDateString()}`
                              : `category · ${b.category}`}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: 6,
                            }}
                          >
                            <span
                              className="w6-mono"
                              style={{ fontSize: 12 }}
                            >
                              target {target}
                            </span>
                          </div>
                          <div
                            style={{
                              height: 6,
                              background: "var(--w6-rule-2)",
                              borderRadius: 999,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                width: b.completed_at ? "100%" : "0%",
                                height: "100%",
                                background: "var(--w6-ink)",
                              }}
                            />
                          </div>
                          <div
                            className="w6-muted"
                            style={{ fontSize: 11.5, marginTop: 10 }}
                          >
                            {b.holding_card
                              ? `card ${b.holding_card.slice(0, 6)}…${b.holding_card.slice(-4)}`
                              : "no holding card yet"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {tab === "roundup" && (
              <section>
                {roundRule ? (
                  <div className="rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5 text-xs">
                    <p>
                      Round every send up to the nearest{" "}
                      <strong>{formatUsdc(roundRule.round_to_lamports)}</strong>; difference
                      lands at{" "}
                      <code>
                        {roundRule.dest_pubkey.slice(0, 6)}…{roundRule.dest_pubkey.slice(-4)}
                      </code>
                      .
                    </p>
                    <button
                      onClick={disableRoundUp}
                      className="mt-3 rounded-full border border-[#a1a1aa] px-4 py-2 text-[#27272a]"
                    >
                      Disable
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-3 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5">
                    <p className="text-xs text-[#52525b]">
                      Pick a granularity. Round-ups fire AFTER the original transfer
                      lands; you'll see them as their own receipts.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {ROUND_PRESETS.map((p) => (
                        <button
                          key={p.value}
                          onClick={() => setRoundChoice(p.value)}
                          className={`rounded-full px-3 py-1 text-xs ${
                            roundChoice === p.value
                              ? "bg-[var(--w6-ink)] text-[var(--w6-bg)]"
                              : "border border-[#e4e4e7] text-[var(--w6-ink-3)]"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <input
                      placeholder="Destination pubkey (e.g. your savings card)"
                      value={roundDest}
                      onChange={(e) => setRoundDest(e.target.value)}
                      className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                    />
                    <button
                      onClick={saveRoundUp}
                      className="w6-btn w6-btn-primary w-full"
                    >
                      Enable round-up
                    </button>
                  </div>
                )}
              </section>
            )}

            {tab === "gift" && (
              <section>
                <div className="grid gap-3 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5">
                  <input
                    placeholder="Recipient @handle"
                    value={giftHandle}
                    onChange={(e) =>
                      setGiftHandle(e.target.value.replace(/^@/, "").toLowerCase())
                    }
                    className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="USDC"
                    value={giftAmount}
                    onChange={(e) => setGiftAmount(e.target.value)}
                    className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Escrow card pubkey"
                    value={giftEscrow}
                    onChange={(e) => setGiftEscrow(e.target.value)}
                    className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                  />
                  <input
                    placeholder="Note (optional)"
                    value={giftNote}
                    onChange={(e) => setGiftNote(e.target.value)}
                    className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm"
                  />
                  <button
                    onClick={createGift}
                    className="w6-btn w6-btn-primary w-full"
                  >
                    Send gift
                  </button>
                </div>
                <ul className="mt-6 space-y-2">
                  {gifts.map((g) => (
                    <li
                      key={g.gift_id}
                      className="rounded-xl border border-[#e4e4e7] bg-white/[0.02] p-4 text-xs"
                    >
                      <div className="flex items-baseline justify-between">
                        <strong>
                          {formatUsdc(g.amount_lamports)} → @{g.recipient_handle}
                        </strong>
                        <span
                          className={`text-[#52525b] ${
                            g.status === "claimed" ? "text-emerald-400" : ""
                          }`}
                        >
                          {g.status}
                        </span>
                      </div>
                      {g.note && <div className="mt-1 text-[#52525b]">{g.note}</div>}
                      <div className="mt-1 text-[#71717a]">
                        expires {new Date(g.expires_at).toLocaleDateString()}
                      </div>

                      {/* Pact funding state — same trichotomy as scheduled
                          sends. The relayer fires only when pact_pubkey is
                          set, so make the gap loud + offer one-click spawn. */}
                      {g.pact_pubkey ? (
                        <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/[0.05] px-3 py-1 text-[11px] text-emerald-300">
                          <span>✓ funded</span>
                          <code className="text-emerald-300/70">
                            {g.pact_pubkey.slice(0, 6)}…{g.pact_pubkey.slice(-4)}
                          </code>
                        </div>
                      ) : g.status === "claimed" ? (
                        <button
                          onClick={() => spawnPactForGift(g)}
                          className="mt-3 rounded-full border border-amber-400/40 bg-amber-400/[0.05] px-3 py-1 text-[11px] text-amber-200 hover:bg-amber-400/10"
                        >
                          ⚠ Spawn Pact to fulfill →
                        </button>
                      ) : g.status === "pending" ? (
                        <p className="mt-3 text-[11px] text-[#71717a]">
                          waiting for recipient to claim
                        </p>
                      ) : null}
                    </li>
                  ))}
                  {gifts.length === 0 && (
                    <p className="text-xs text-[#71717a]">No gifts sent yet.</p>
                  )}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </W6AppShell>
  );
}
