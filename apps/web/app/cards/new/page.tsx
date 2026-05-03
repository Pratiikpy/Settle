"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { TrustGesture } from "@settle/ui";
import { fireSettlementConfetti, trustGesture } from "../../../lib/confetti";
import { getSolscanUrl } from "../../../lib/solana";
import { LocaleSwitcher } from "../../../components/locale-switcher";
import { useTranslate } from "../../../lib/i18n";
import { W6AppShell } from "../../../components/w6-app-shell";

/**
 * /cards/new — Create an AgentCard.
 *
 * Two flavors of the same flow, distinguished by the `?agent=` query param:
 *   - No `agent` param → server generates a fresh agent keypair, returns the
 *     secret to the user (legacy demo flow).
 *   - `?agent=<pubkey>` → client-supplied mode. The card's agent_pubkey is
 *     pinned to the supplied pubkey; the server NEVER sees the agent privkey.
 *     This is how Phase 5 delegation works: the user clicks "delegate" on
 *     /settings/relayer, lands here with `?agent=<relayer_pubkey>`, picks a
 *     daily cap + allowlist, signs once, and now scheduled sends + auto-refill
 *     can fire from this card without the user being online.
 *
 * The label "main" is reserved for the user's primary card. When delegating,
 * default to "delegated-relayer" so the cards index page reads sensibly.
 *
 * Real flow:
 *   1. POST /api/agents/create-card → base64 unsigned create_card tx (+ agent secret if mode=server_generated)
 *   2. Phantom signs
 *   3. Submit + confirm on devnet
 *   4. Show user the agent secret (server-generated mode only)
 *   5. Redirect to /cards
 */
export default function NewCardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { t } = useTranslate();

  // Pre-supplied agent pubkey (e.g. from /settings/relayer "Delegate" button).
  // When set, we use client-supplied mode: server never sees an agent privkey.
  const presetAgent = searchParams?.get("agent") ?? null;
  const isDelegationFlow = Boolean(presetAgent);

  const [label, setLabel] = useState(() =>
    isDelegationFlow ? "delegated-relayer" : "main",
  );
  const [dailyCap, setDailyCap] = useState("100.00");
  const [perCallMax, setPerCallMax] = useState("5.00");
  const [expiryDays, setExpiryDays] = useState(30);

  // Allowlist with optional per-merchant capability pin. Each entry is
  // {merchant: pubkey, capabilityHashHex?: 64-char hex}. When pinned, the on-chain
  // spend rejects any call whose capability_hash doesn't match exactly — strongest
  // custody guarantee available.
  type AllowlistEntry = { merchant: string; capabilityHashHex?: string };
  // Default merchants come from env. The fallback placeholders below are
  // intentionally non-base58 stubs that the API will reject — that's the
  // signal to the user (and the deploying operator) to set the
  // NEXT_PUBLIC_MERCHANT_* envs with real on-chain merchant pubkeys before
  // shipping. They are NOT meant to be left as-is in production.
  const defaultMerchants: AllowlistEntry[] = [
    {
      merchant:
        process.env.NEXT_PUBLIC_MERCHANT_ARXIV ?? "Arxv1111111111111111111111111111111111111a",
    },
    {
      merchant:
        process.env.NEXT_PUBLIC_MERCHANT_TRANSLATE ??
        "Trns1111111111111111111111111111111111111a",
    },
    {
      merchant:
        process.env.NEXT_PUBLIC_MERCHANT_SUMMARY ??
        "Sumr1111111111111111111111111111111111111a",
    },
  ];
  const [allowlist, setAllowlist] = useState<AllowlistEntry[]>(defaultMerchants);
  const [showCapabilityPins, setShowCapabilityPins] = useState(false);

  const [gesture, setGesture] = useState<
    "idle" | "signing" | "confirming" | "success" | "error"
  >("idle");
  const [created, setCreated] = useState<{
    cardPubkey: string;
    agentPubkey: string;
    agentSecret: string;
    sig: string;
  } | null>(null);

  async function handleCreate() {
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect Phantom to continue.");
      return;
    }
    if (parseFloat(perCallMax) > parseFloat(dailyCap)) {
      toast.error("Per-call max must be ≤ daily cap.");
      return;
    }

    // Validate any capability pins are correctly hex-encoded before we hit the API.
    for (const entry of allowlist) {
      if (entry.capabilityHashHex && !/^[0-9a-fA-F]{64}$/.test(entry.capabilityHashHex)) {
        toast.error(
          `Capability pin for ${entry.merchant.slice(0, 6)}… must be 64 hex chars (32 bytes).`,
        );
        return;
      }
    }

    trustGesture();
    setGesture("signing");

    try {
      const buildRes = await fetch("/api/agents/create-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authority: publicKey.toBase58(),
          // Client-supplied mode when delegating. Server never sees an agent privkey.
          ...(presetAgent ? { agent_pubkey: presetAgent } : {}),
          label,
          dailyCapUsdc: dailyCap,
          perCallMaxUsdc: perCallMax,
          // Send the object form so capability pins propagate.
          merchantAllowlist: allowlist.map((e) =>
            e.capabilityHashHex
              ? { merchant: e.merchant, capabilityHashHex: e.capabilityHashHex }
              : { merchant: e.merchant },
          ),
          expiryDays,
        }),
      });
      if (!buildRes.ok) {
        const err = await buildRes.json();
        throw new Error(err.error ?? "build_failed");
      }
      const data = (await buildRes.json()) as {
        transaction: string;
        card_pubkey: string;
        agent_pubkey: string;
        agent_secret_b58: string;
      };

      const tx = Transaction.from(Buffer.from(data.transaction, "base64"));
      const signed = await signTransaction(tx);

      setGesture("confirming");

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

      setGesture("success");
      fireSettlementConfetti();
      setCreated({
        cardPubkey: data.card_pubkey,
        agentPubkey: data.agent_pubkey,
        agentSecret: data.agent_secret_b58,
        sig,
      });
      toast.success("Card created on Solana devnet.", {
        action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(sig), "_blank") },
      });
    } catch (e) {
      setGesture("error");
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setTimeout(() => setGesture("idle"), 2400);
    }
  }

  function copyAgentSecret() {
    if (!created) return;
    void navigator.clipboard.writeText(created.agentSecret);
    toast.success("Agent secret copied. Save it as SETTLE_AGENT_PRIVKEY in demo-agent/.env.");
  }

  return (
    <W6AppShell>
      <div style={{ maxWidth: 760 }}>
        <div
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
              New Pact · open
            </div>
            <h1
              className="w6-heading"
              style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
            >
              {isDelegationFlow
                ? "Delegate to relayer."
                : t("cards.new_title")}
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
              {isDelegationFlow
                ? "You're creating a new agent budget with the Settle relayer as its agent. Phase 5 automation can spend within the cap + allowlist below — and only that."
                : t("cards.new_subtitle")}
            </p>
          </div>
          <LocaleSwitcher />
        </div>

      {isDelegationFlow && presetAgent && (
        <div
          className="w6-card"
          style={{
            padding: 18,
            marginBottom: 24,
            borderColor: "var(--w6-warn-cluster)",
            background: "rgba(245, 158, 11, 0.06)",
          }}
        >
          <div className="w6-eyebrow" style={{ fontSize: 11 }}>
            Delegated agent
          </div>
          <code
            className="w6-mono"
            style={{
              marginTop: 6,
              display: "block",
              wordBreak: "break-all",
              fontSize: 12,
              color: "var(--w6-ink)",
            }}
          >
            {presetAgent}
          </code>
          <p className="w6-muted" style={{ marginTop: 8, fontSize: 11.5 }}>
            This is the relayer pubkey. The card you sign for here is bound
            to it for life — agents are NOT rotatable on-chain. Tighten
            the daily cap before signing.
          </p>
        </div>
      )}

      {!created ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 320px",
            gap: 28,
            alignItems: "start",
          }}
          className="w6-cardnew-grid"
        >
          <form
            className="w6-card"
            style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            <div>
              <label className="w6-eyebrow" style={{ display: "block", marginBottom: 6 }}>
                Label
              </label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="main"
                className="w6-input w6-input-lg"
                style={{ width: "100%" }}
              />
              <p className="w6-muted" style={{ marginTop: 6, fontSize: 11 }}>
                Used as PDA seed. One AgentCard per (authority, label).
              </p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label className="w6-eyebrow" style={{ display: "block", marginBottom: 6 }}>
                  Daily cap (USDC)
                </label>
                <input
                  value={dailyCap}
                  onChange={(e) => setDailyCap(e.target.value)}
                  placeholder="100.00"
                  inputMode="decimal"
                  className="w6-input w6-input-lg"
                  style={{ width: "100%" }}
                />
              </div>
              <div>
                <label className="w6-eyebrow" style={{ display: "block", marginBottom: 6 }}>
                  Per-call max (USDC)
                </label>
                <input
                  value={perCallMax}
                  onChange={(e) => setPerCallMax(e.target.value)}
                  placeholder="5.00"
                  inputMode="decimal"
                  className="w6-input w6-input-lg"
                  style={{ width: "100%" }}
                />
              </div>
            </div>

            <div>
              <label className="w6-eyebrow" style={{ display: "block", marginBottom: 6 }}>
                Expiry (days)
              </label>
              <input
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                type="number"
                min={1}
                max={365}
                className="w6-input w6-input-lg"
                style={{ width: "100%" }}
              />
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <label className="w6-eyebrow">
                  Merchant allowlist ({allowlist.length})
                </label>
                <button
                  type="button"
                  onClick={() => setShowCapabilityPins((v) => !v)}
                  style={{
                    fontSize: 11,
                    color: "var(--w6-ink-2)",
                    background: "transparent",
                    border: 0,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  {showCapabilityPins
                    ? "Hide capability pins"
                    : "Pin capability hashes (optional)"}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {allowlist.map((entry, i) => (
                  <div
                    key={`${entry.merchant}-${i}`}
                    className="w6-card-flat"
                    style={{ padding: 12 }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        className="w6-mono"
                        style={{ fontSize: 11, color: "var(--w6-ink-2)" }}
                      >
                        {entry.merchant.slice(0, 6)}…{entry.merchant.slice(-4)}
                      </span>
                      {entry.capabilityHashHex && (
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "2px 6px",
                            borderRadius: 999,
                            background: "rgba(22, 163, 74, 0.1)",
                            color: "var(--w6-ok)",
                            fontSize: 9,
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.12em",
                          }}
                        >
                          pinned
                        </span>
                      )}
                    </div>
                    {showCapabilityPins && (
                      <input
                        value={entry.capabilityHashHex ?? ""}
                        onChange={(e) => {
                          const next = [...allowlist];
                          const current = next[i];
                          if (!current) return;
                          const updated: AllowlistEntry = {
                            merchant: current.merchant,
                            ...(e.target.value
                              ? { capabilityHashHex: e.target.value }
                              : {}),
                          };
                          next[i] = updated;
                          setAllowlist(next);
                        }}
                        placeholder="64-char capability hash (BLAKE3 hex) — leave blank for unpinned"
                        className="w6-input w6-mono"
                        style={{ marginTop: 8, width: "100%", fontSize: 10 }}
                      />
                    )}
                  </div>
                ))}
              </div>
              {showCapabilityPins && (
                <p className="w6-muted" style={{ marginTop: 8, fontSize: 11 }}>
                  Pinning a capability hash means the on-chain spend
                  rejects any call whose capability hash doesn&apos;t match
                  exactly. Strongest custody control.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!connected || gesture !== "idle"}
              className="w6-btn w6-btn-primary w6-btn-lg"
              style={{ width: "100%", justifyContent: "center" }}
            >
              {!connected
                ? "Connect a wallet to create"
                : gesture === "signing"
                  ? "Signing in Phantom…"
                  : gesture === "confirming"
                    ? "Creating on Solana…"
                    : "Create agent budget"}
            </button>

            <p className="w6-muted" style={{ fontSize: 11 }}>
              Anchor <code>create_card</code> ix · PDA derived from{" "}
              <code>[&quot;agent-card&quot;, authority, label_hash]</code> ·
              Atomic.
            </p>
          </form>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="w6-eyebrow">Preview</div>
            <div className="w6-card" style={{ padding: 22 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "var(--w6-ink)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {(label[0] ?? "C").toUpperCase()}
                </div>
                <div>
                  <div className="w6-heading" style={{ fontSize: 16 }}>
                    {label || "card"}
                  </div>
                  <div className="w6-muted" style={{ fontSize: 11.5 }}>
                    {publicKey
                      ? `@${publicKey.toBase58().slice(0, 6)}`
                      : "@me"}
                  </div>
                </div>
              </div>
              <div className="w6-eyebrow" style={{ fontSize: 10.5 }}>
                Daily cap
              </div>
              <div
                className="w6-heading"
                style={{
                  fontSize: 28,
                  marginTop: 4,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                ${parseFloat(dailyCap || "0").toFixed(2)}
              </div>
              <div
                className="w6-muted"
                style={{ marginTop: 4, fontSize: 11.5 }}
              >
                Per-call max ${perCallMax} · {expiryDays}d expiry ·{" "}
                {allowlist.length} merchants
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            className="w6-card"
            style={{ padding: 24, borderColor: "var(--w6-ok)" }}
          >
            <h2
              className="w6-heading"
              style={{ fontSize: 22, margin: 0, color: "var(--w6-ok)" }}
            >
              ✓ Card created
            </h2>
            <p
              className="w6-muted"
              style={{
                marginTop: 8,
                fontSize: 14,
                lineHeight: 1.55,
              }}
            >
              Save the agent secret below. It signs requests as the AI
              agent attached to this card. You&apos;ll need it for{" "}
              <code
                style={{
                  background: "var(--w6-bg-3)",
                  padding: "2px 6px",
                  borderRadius: 4,
                  fontSize: 11,
                }}
              >
                SETTLE_AGENT_PRIVKEY
              </code>{" "}
              in <code>apps/demo-agent/.env</code>.
            </p>

            <div
              style={{
                marginTop: 18,
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <Field label="Card PDA" value={created.cardPubkey} />
              <Field label="Agent pubkey" value={created.agentPubkey} />
              <div>
                <div className="w6-eyebrow" style={{ fontSize: 11 }}>
                  Agent secret (sensitive — copy once)
                </div>
                <code
                  className="w6-mono"
                  style={{
                    display: "block",
                    marginTop: 4,
                    wordBreak: "break-all",
                    fontSize: 11.5,
                    color: "var(--w6-ink-4)",
                  }}
                >
                  {created.agentSecret.slice(0, 16)}…
                  {created.agentSecret.slice(-4)}
                </code>
                <button
                  type="button"
                  onClick={copyAgentSecret}
                  className="w6-btn w6-btn-secondary w6-btn-sm"
                  style={{ marginTop: 10 }}
                >
                  Copy full secret
                </button>
              </div>
            </div>

            <div
              style={{
                marginTop: 24,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <a
                href={getSolscanUrl(created.sig)}
                target="_blank"
                rel="noreferrer"
                className="w6-btn w6-btn-secondary w6-btn-sm"
              >
                Solscan ↗
              </a>
              <button
                type="button"
                onClick={() => router.push("/cards")}
                className="w6-btn w6-btn-primary w6-btn-sm"
              >
                Go to your cards
              </button>
              <button
                type="button"
                onClick={() => router.push("/agents")}
                className="w6-btn w6-btn-secondary w6-btn-sm"
              >
                Hire an AI agent →
              </button>
            </div>
          </div>
        </div>
      )}

        <TrustGesture state={gesture} />

        <style>{`
          @media (max-width: 880px) {
            .w6-cardnew-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </W6AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="w6-eyebrow" style={{ fontSize: 11 }}>
        {label}
      </div>
      <code
        className="w6-mono"
        style={{
          display: "block",
          marginTop: 4,
          wordBreak: "break-all",
          fontSize: 12,
          color: "var(--w6-ink)",
        }}
      >
        {value}
      </code>
    </div>
  );
}
