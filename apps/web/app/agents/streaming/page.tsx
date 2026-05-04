"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { trustGesture } from "../../../lib/confetti";
import { getSolscanUrl } from "../../../lib/solana";
import { PauseOnBlur } from "../../../components/pause-on-blur";
import { W6AppShell } from "../../../components/w6-app-shell";

/**
 * F13 / F14 — Streaming Pact full lifecycle UI.
 *
 *   1. "Open new stream" form → POST /api/streaming-pacts/open → wallet signs the
 *      open_streaming_pact ix.
 *   2. Active stream list with: live $/sec accrual estimate, Pause/Resume
 *      (wallet-signed via the existing /pause and /resume endpoints), and a
 *      Claim Now button (server-side facilitator-signed via /claim).
 *   3. The browser-side accrual is a 1 Hz tick × rate / SLOT_MS estimate. The
 *      authoritative truth is the on-chain claim — each successful claim updates
 *      the indexed `claimed` and `last_claim_slot`.
 */

interface CardRow {
  card_pubkey: string;
  label: string;
  daily_cap_lamports: string | number;
  expiry_slot: string | number;
  revoked: boolean;
}

interface PactRow {
  pact_pubkey: string;
  parent_card: string;
  scope_label: string;
  mode: "oneshot" | "streaming" | "delivery_escrow";
  rate_lamports_per_slot: string | null;
  max_total_lamports: string | null;
  claimed: string | null;
  paused: boolean;
  closed: boolean;
  expiry_slot: string;
  last_claim_slot?: string;
}

const SLOT_MS = 400; // mainnet ≈ 400 ms/slot; devnet drifts but close enough for UX
const SLOTS_PER_MIN = 1_000n * 60n / BigInt(SLOT_MS); // = 150 slots/min at 400 ms

function lamportsToUsd(v: bigint | string | number): string {
  const n = typeof v === "bigint" ? v : BigInt(typeof v === "string" ? v : Math.round(Number(v)));
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  return `$${whole}.${frac.toString().padStart(6, "0").slice(0, 4)}`;
}

export default function StreamingDashboard() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [cards, setCards] = useState<CardRow[]>([]);
  const [pacts, setPacts] = useState<PactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tickMs, setTickMs] = useState(0);

  async function refresh() {
    if (!publicKey) return;
    const r = await fetch(`/api/cards/list?authority=${publicKey.toBase58()}`);
    const d = await r.json();
    if (d.ok) {
      setCards(d.cards ?? []);
      setPacts(
        (d.pacts ?? []).filter((p: PactRow) => p.mode === "streaming" && !p.closed),
      );
    }
  }

  useEffect(() => {
    if (!connected || !publicKey) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) toast.error(`Could not load: ${(e as Error).message}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey]);

  useEffect(() => {
    if (pacts.length === 0) return;
    const id = window.setInterval(() => setTickMs((v) => v + 1000), 1000);
    return () => window.clearInterval(id);
  }, [pacts.length]);

  async function callPauseOrResume(pact: PactRow, action: "pause" | "resume") {
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect a wallet to control the stream.");
      return;
    }
    try {
      const r = await fetch(`/api/streaming-pacts/${pact.pact_pubkey}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authority: publicKey.toBase58() }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.message ?? d.error ?? `${action}_failed`);
      const tx = Transaction.from(Buffer.from(d.transaction, "base64"));
      trustGesture();
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
      toast.success(`Stream ${action}d.`, {
        action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(sig), "_blank") },
      });
      setPacts((prev) =>
        prev.map((p) =>
          p.pact_pubkey === pact.pact_pubkey ? { ...p, paused: action === "pause" } : p,
        ),
      );
    } catch (e) {
      toast.error(`${action} failed: ${(e as Error).message}`);
    }
  }

  return (
    <W6AppShell forceSurface="agent">
      <div style={{ maxWidth: 760 }}>
        <header
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="w6-eyebrow" style={{ fontSize: 12 }}>
              Streaming Pacts
            </div>
            <h1
              className="w6-heading"
              style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
            >
              Live spend.
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
              Agent salaries that flow per-slot. Pause anytime. Cancel
              returns the unspent USDC on-chain.
            </p>
          </div>
        </header>

      {connected && (
        <OpenStreamForm
          cards={cards}
          onCreated={() => {
            void refresh();
          }}
        />
      )}

      {!connected ? (
        <div className="mt-6 rounded-2xl border border-[#e4e4e7] bg-[#f4f4f5] p-6 text-sm text-[#52525b]">
          Connect a wallet to see your active streaming rules.
        </div>
      ) : loading ? (
        <div className="mt-6 text-sm text-[#52525b]">Loading…</div>
      ) : pacts.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-[#e4e4e7] bg-[#f4f4f5] p-6 text-sm text-[#52525b]">
          No active streaming rules yet. Open one with the form above.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {pacts.map((pact) => (
            <StreamingCard
              key={pact.pact_pubkey}
              pact={pact}
              tickMs={tickMs}
              onPauseToggle={() =>
                void callPauseOrResume(pact, pact.paused ? "resume" : "pause")
              }
              onClaimed={() => {
                void refresh();
              }}
            />
          ))}
        </div>
      )}
      </div>
    </W6AppShell>
  );
}

function OpenStreamForm({
  cards,
  onCreated,
}: {
  cards: CardRow[];
  onCreated: () => void;
}) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [parentCard, setParentCard] = useState("");
  const [scopeLabel, setScopeLabel] = useState("research-stream");
  const [ratePerMinUsd, setRatePerMinUsd] = useState("0.10");
  const [maxTotalUsd, setMaxTotalUsd] = useState("5.00");
  const [merchant, setMerchant] = useState("");
  const [expiryDays, setExpiryDays] = useState(30);

  // ratePerMin → ratePerSlot conversion. With SLOT_MS = 400 ms and ~150 slots/min:
  //   rate_per_slot = round(rate_per_min_lamports / 150)
  const ratePerSlotPreview = useMemo(() => {
    const usd = parseFloat(ratePerMinUsd || "0");
    if (!Number.isFinite(usd) || usd <= 0) return 0n;
    const lamportsPerMin = BigInt(Math.round(usd * 1_000_000));
    return lamportsPerMin / SLOTS_PER_MIN;
  }, [ratePerMinUsd]);

  async function submit() {
    if (!publicKey || !signTransaction) {
      toast.error("Connect a wallet.");
      return;
    }
    if (!parentCard) {
      toast.error("Pick a parent card.");
      return;
    }
    if (ratePerSlotPreview <= 0n) {
      toast.error("Rate too small — increase $/min.");
      return;
    }
    const maxTotalLamports = BigInt(Math.round(parseFloat(maxTotalUsd) * 1_000_000));
    if (maxTotalLamports <= 0n) {
      toast.error("Max total must be > 0.");
      return;
    }
    setSubmitting(true);
    try {
      const slot = await connection.getSlot("confirmed");
      const expirySlot = String(slot + expiryDays * 216_000);

      const r = await fetch("/api/streaming-pacts/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authority: publicKey.toBase58(),
          parentCard,
          scopeLabel,
          rateLamportsPerSlot: ratePerSlotPreview.toString(),
          maxTotalLamports: maxTotalLamports.toString(),
          allowlist: [{ merchant }],
          expirySlot,
        }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.message ?? d.error ?? "open_failed");

      const tx = Transaction.from(Buffer.from(d.transaction, "base64"));
      trustGesture();
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
      toast.success("Streaming rule opened.", {
        action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(sig), "_blank") },
      });
      setOpen(false);
      onCreated();
    } catch (e) {
      toast.error(`Open failed: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-medium text-background hover:bg-accent/90"
      >
        + Open new stream
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium">Open a streaming rule</h2>
        <button
          onClick={() => setOpen(false)}
          className="text-[11px] text-[#52525b] hover:text-[#09090b]"
        >
          Cancel
        </button>
      </div>
      <div className="mt-4 grid gap-3 text-sm">
        <div>
          <label className="block text-xs font-medium text-[#52525b]">Parent card</label>
          <select
            value={parentCard}
            onChange={(e) => setParentCard(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">— pick a card —</option>
            {cards
              .filter((c) => !c.revoked)
              .map((c) => (
                <option key={c.card_pubkey} value={c.card_pubkey}>
                  {c.label || c.card_pubkey.slice(0, 6)} · daily cap $
                  {(Number(c.daily_cap_lamports) / 1_000_000).toFixed(2)}
                </option>
              ))}
          </select>
          {cards.length === 0 && (
            <p className="mt-1 text-[11px] text-[#71717a]">
              No cards yet —{" "}
              <a className="text-accent hover:underline" href="/cards/new">
                create one first
              </a>
              .
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-[#52525b]">Scope label</label>
          <input
            value={scopeLabel}
            onChange={(e) => setScopeLabel(e.target.value)}
            placeholder="research-stream"
            className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 outline-none focus:border-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#52525b]">
              Rate ($/min)
            </label>
            <input
              value={ratePerMinUsd}
              onChange={(e) => setRatePerMinUsd(e.target.value)}
              inputMode="decimal"
              placeholder="0.10"
              className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 outline-none focus:border-accent"
            />
            <p className="mt-1 font-mono text-[10px] text-[#71717a]">
              ≈ {ratePerSlotPreview.toString()} lamports/slot
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#52525b]">
              Max total ($)
            </label>
            <input
              value={maxTotalUsd}
              onChange={(e) => setMaxTotalUsd(e.target.value)}
              inputMode="decimal"
              placeholder="5.00"
              className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 outline-none focus:border-accent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#52525b]">
            Allowed merchant (must be on parent card)
          </label>
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="merchant pubkey (Solana address)"
            className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 font-mono text-xs outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#52525b]">Expiry (days)</label>
          <input
            value={expiryDays}
            onChange={(e) => setExpiryDays(Math.max(1, Math.min(365, Number(e.target.value))))}
            type="number"
            min={1}
            max={365}
            className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 outline-none focus:border-accent"
          />
        </div>
      </div>

      <button
        onClick={() => void submit()}
        disabled={submitting}
        className="mt-4 w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
      >
        {submitting ? "Opening…" : "Open + fund vault"}
      </button>
      <p className="mt-2 text-[10px] text-[#71717a]">
        Vault funded atomically with max-total. Authority can pause/cancel any time;
        cancel returns unspent USDC via close_pact.
      </p>
    </section>
  );
}

function StreamingCard({
  pact,
  tickMs,
  onPauseToggle,
  onClaimed,
}: {
  pact: PactRow;
  tickMs: number;
  onPauseToggle: () => void;
  onClaimed: () => void;
}) {
  const accruedExtra = useMemo(() => {
    if (pact.paused) return 0n;
    const rate = BigInt(pact.rate_lamports_per_slot ?? "0");
    if (rate === 0n) return 0n;
    const slotsTicked = Math.floor(tickMs / SLOT_MS);
    return BigInt(slotsTicked) * rate;
  }, [pact.paused, pact.rate_lamports_per_slot, tickMs]);

  const claimed = BigInt(pact.claimed ?? "0");
  const maxTotal = BigInt(pact.max_total_lamports ?? "0");
  const accruedTotal = claimed + accruedExtra;
  const cappedAccrued = accruedTotal > maxTotal ? maxTotal : accruedTotal;
  const progressPct = maxTotal > 0n ? Number((cappedAccrued * 1000n) / maxTotal) / 10 : 0;

  const ratePerSec = useMemo(() => {
    const rate = BigInt(pact.rate_lamports_per_slot ?? "0");
    const lamportsPerSec = (rate * 1000n) / BigInt(SLOT_MS);
    return lamportsToUsd(lamportsPerSec);
  }, [pact.rate_lamports_per_slot]);

  // Inline claim form
  const [showClaim, setShowClaim] = useState(false);
  const [claimMerchant, setClaimMerchant] = useState("");
  const [claimPurpose, setClaimPurpose] = useState("");
  const [claiming, setClaiming] = useState(false);

  async function fireClaim() {
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(claimMerchant)) {
      toast.error("Enter a valid Solana merchant pubkey.");
      return;
    }
    if (!claimPurpose.trim()) {
      toast.error("Enter a short purpose string for the receipt.");
      return;
    }
    setClaiming(true);
    try {
      const r = await fetch(`/api/streaming-pacts/${pact.pact_pubkey}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant: claimMerchant, purpose: claimPurpose }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.message ?? d.error ?? "claim_failed");
      toast.success(
        `Claimed. Total now $${(Number(d.claimed_after) / 1_000_000).toFixed(4)}`,
        {
          action: {
            label: "Solscan ↗",
            onClick: () => window.open(getSolscanUrl(d.signature), "_blank"),
          },
        },
      );
      setShowClaim(false);
      setClaimPurpose("");
      onClaimed();
    } catch (e) {
      toast.error(`Claim failed: ${(e as Error).message}`);
    } finally {
      setClaiming(false);
    }
  }

  return (
    <article className="rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-[#52525b]">
            Stream · {pact.scope_label}
          </div>
          <div className="mt-1 font-mono text-[10px] text-[#71717a]">
            {pact.pact_pubkey.slice(0, 8)}…{pact.pact_pubkey.slice(-6)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onPauseToggle}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              pact.paused
                ? "bg-emerald-500 text-background hover:bg-emerald-400"
                : "bg-amber-500/90 text-background hover:bg-amber-400"
            }`}
          >
            {pact.paused ? "Resume" : "Pause"}
          </button>
          <button
            onClick={() => setShowClaim((v) => !v)}
            className="rounded-full border border-[#a1a1aa] px-3 py-1.5 text-xs font-medium hover:bg-[#f4f4f5]"
          >
            Claim now
          </button>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[#52525b]">
            {pact.paused ? "Paused" : `Accruing at ${ratePerSec}/sec`}
          </span>
          <span className="font-mono text-[11px] text-[#52525b]">
            {progressPct.toFixed(2)}%
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e4e4e7]">
          <div
            className={`h-full ${pact.paused ? "bg-amber-500/70" : "bg-accent"}`}
            style={{ width: `${Math.min(progressPct, 100)}%` }}
          />
        </div>
        <div className="mt-2 flex items-baseline justify-between text-[11px]">
          <span className="text-[#52525b]">
            Claimed: <span className="font-mono">{lamportsToUsd(claimed)}</span>
          </span>
          <span className="text-[#52525b]">
            Live estimate:{" "}
            <span className="font-mono text-accent">{lamportsToUsd(cappedAccrued)}</span>
          </span>
          <span className="text-[#52525b]">
            Max: <span className="font-mono">{lamportsToUsd(maxTotal)}</span>
          </span>
        </div>
      </div>

      {showClaim && (
        <div className="mt-4 rounded-xl border border-[#e4e4e7] bg-[#fafafa] p-3">
          <div className="grid gap-2">
            <input
              value={claimMerchant}
              onChange={(e) => setClaimMerchant(e.target.value)}
              placeholder="merchant pubkey"
              className="rounded border border-[#e4e4e7] bg-transparent px-2 py-1.5 font-mono text-[11px] outline-none focus:border-accent"
            />
            <input
              value={claimPurpose}
              onChange={(e) => setClaimPurpose(e.target.value)}
              placeholder="purpose (short string for the receipt)"
              maxLength={280}
              className="rounded border border-[#e4e4e7] bg-transparent px-2 py-1.5 text-xs outline-none focus:border-accent"
            />
            <button
              onClick={() => void fireClaim()}
              disabled={claiming}
              className="rounded-full bg-accent px-3 py-2 text-xs font-medium text-background disabled:opacity-50"
            >
              {claiming ? "Claiming…" : "Fire claim_streaming ix"}
            </button>
            <p className="text-[10px] text-[#71717a]">
              The server (using SETTLE_FACILITATOR_PRIVKEY = card.agent_pubkey) signs +
              submits. Demo path — production agents call this from their own runtime.
            </p>
          </div>
        </div>
      )}

      <p className="mt-4 text-[10px] text-[#71717a]">
        Live estimate ticks in the browser. The on-chain truth advances on each
        successful claim_streaming.
      </p>

      <PauseOnBlur
        pactPubkey={pact.pact_pubkey}
        scopeLabel={pact.scope_label}
        ratePerSlot={BigInt(pact.rate_lamports_per_slot ?? "0")}
        paused={pact.paused}
        onChanged={onClaimed}
      />
    </article>
  );
}
