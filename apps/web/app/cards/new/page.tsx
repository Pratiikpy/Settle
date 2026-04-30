"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { SettleCard, TrustGesture } from "@settle/ui";
import { fireSettlementConfetti, trustGesture } from "../../../lib/confetti";
import { getSolscanUrl } from "../../../lib/solana";

/**
 * /cards/new — Create your first AgentCard.
 *
 * Real flow:
 *   1. POST /api/agents/create-card returns base64 unsigned create_card tx + agent secret
 *   2. Phantom signs
 *   3. Submit + confirm on devnet
 *   4. Show user the agent secret + the settle:// envelope to copy into demo-agent .env
 *   5. Redirect to /cards
 */
export default function NewCardPage() {
  const router = useRouter();
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [label, setLabel] = useState("main");
  const [dailyCap, setDailyCap] = useState("100.00");
  const [perCallMax, setPerCallMax] = useState("5.00");
  const [expiryDays, setExpiryDays] = useState(30);

  // Allowlist with optional per-merchant capability pin. Each entry is
  // {merchant: pubkey, capabilityHashHex?: 64-char hex}. When pinned, the on-chain
  // spend rejects any call whose capability_hash doesn't match exactly — strongest
  // custody guarantee available.
  type AllowlistEntry = { merchant: string; capabilityHashHex?: string };
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
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Create your first card</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Your AgentCard is the parent object that holds caps, allowlist, expiry, and revoke. Each
        AI-agent task spawns a Pact card scoped under it.
      </p>

      {!created ? (
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr,360px]">
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            <div>
              <label className="block text-xs font-medium text-foreground/60">Label</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="main"
                className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
              />
              <p className="mt-1 text-xs text-foreground/40">
                Used as PDA seed. One AgentCard per (authority, label).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-foreground/60">
                  Daily cap (USDC)
                </label>
                <input
                  value={dailyCap}
                  onChange={(e) => setDailyCap(e.target.value)}
                  placeholder="100.00"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground/60">
                  Per-call max (USDC)
                </label>
                <input
                  value={perCallMax}
                  onChange={(e) => setPerCallMax(e.target.value)}
                  placeholder="5.00"
                  inputMode="decimal"
                  className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-foreground/60">
                Expiry (days)
              </label>
              <input
                value={expiryDays}
                onChange={(e) => setExpiryDays(Number(e.target.value))}
                type="number"
                min={1}
                max={365}
                className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label className="block text-xs font-medium text-foreground/60">
                  Merchant allowlist ({allowlist.length})
                </label>
                <button
                  type="button"
                  onClick={() => setShowCapabilityPins((v) => !v)}
                  className="text-[11px] text-accent hover:underline"
                >
                  {showCapabilityPins ? "Hide capability pins" : "Pin capability hashes (optional)"}
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {allowlist.map((entry, i) => (
                  <div
                    key={`${entry.merchant}-${i}`}
                    className="rounded-lg border border-foreground/10 bg-foreground/[0.02] p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-foreground/60">
                        {entry.merchant.slice(0, 6)}…{entry.merchant.slice(-4)}
                      </span>
                      {entry.capabilityHashHex && (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-emerald-500">
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
                            ...(e.target.value ? { capabilityHashHex: e.target.value } : {}),
                          };
                          next[i] = updated;
                          setAllowlist(next);
                        }}
                        placeholder="64-char capability hash (BLAKE3 hex) — leave blank for unpinned"
                        className="mt-2 w-full rounded border border-foreground/10 bg-transparent px-2 py-1.5 font-mono text-[10px] outline-none focus:border-accent"
                      />
                    )}
                  </div>
                ))}
              </div>
              {showCapabilityPins && (
                <p className="mt-2 text-[11px] text-foreground/45">
                  Pinning a capability hash means the on-chain spend rejects any call whose{" "}
                  capability hash doesn&apos;t match exactly. Strongest custody control: the
                  agent can only pay this merchant for that exact pinned spec, even if the
                  agent is compromised.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!connected || gesture !== "idle"}
              className="w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
            >
              {!connected
                ? "Connect Phantom to create"
                : gesture === "signing"
                  ? "Signing in Phantom…"
                  : gesture === "confirming"
                    ? "Creating on Solana…"
                    : "Create AgentCard"}
            </button>

            <p className="text-xs text-foreground/50">
              Anchor <code>create_card</code> ix · PDA derived from{" "}
              <code>[&quot;agent-card&quot;, authority, label_hash]</code> · Atomic.
            </p>
          </form>

          <div className="space-y-4">
            <div className="text-xs font-medium uppercase tracking-wider text-foreground/50">
              Preview
            </div>
            <SettleCard
              handle={publicKey ? `@${publicKey.toBase58().slice(0, 6)}` : "@me"}
              balance={`$${parseFloat(dailyCap || "0").toFixed(2)}`}
              symbol={label || "Card"}
              subline={`Per-call $${perCallMax} · ${expiryDays}d`}
              variant="main"
            />
          </div>
        </div>
      ) : (
        <div className="mt-10 space-y-6">
          <SettleCard
            handle={publicKey ? `@${publicKey.toBase58().slice(0, 6)}` : "@me"}
            balance={`$${parseFloat(dailyCap).toFixed(2)}`}
            symbol={label}
            subline="Active"
            variant="main"
          />

          <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6">
            <h2 className="text-lg font-medium text-accent">✓ Card created</h2>
            <p className="mt-2 text-sm text-foreground/70">
              Save the agent secret below. It signs requests as the AI agent attached to this
              card. You&apos;ll need it for{" "}
              <code className="rounded bg-foreground/10 px-1.5 py-0.5 text-xs">
                SETTLE_AGENT_PRIVKEY
              </code>{" "}
              in <code>apps/demo-agent/.env</code>.
            </p>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <div className="text-foreground/50">Card PDA</div>
                <code className="mt-1 block break-all font-mono text-foreground/80">
                  {created.cardPubkey}
                </code>
              </div>
              <div>
                <div className="text-foreground/50">Agent pubkey</div>
                <code className="mt-1 block break-all font-mono text-foreground/80">
                  {created.agentPubkey}
                </code>
              </div>
              <div>
                <div className="text-foreground/50">Agent secret (sensitive — copy once)</div>
                <code className="mt-1 block break-all font-mono text-foreground/40">
                  {created.agentSecret.slice(0, 16)}…{created.agentSecret.slice(-4)}
                </code>
                <button
                  onClick={copyAgentSecret}
                  className="mt-2 rounded-full border border-foreground/20 px-4 py-1.5 text-xs hover:bg-foreground/5"
                >
                  Copy full secret
                </button>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <a
                href={getSolscanUrl(created.sig)}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-foreground/20 px-4 py-2 text-xs hover:bg-foreground/5"
              >
                Solscan ↗
              </a>
              <button
                onClick={() => router.push("/cards")}
                className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-background"
              >
                Go to your cards
              </button>
              <button
                onClick={() => router.push("/agents")}
                className="rounded-full border border-foreground/20 px-4 py-2 text-xs hover:bg-foreground/5"
              >
                Hire an AI agent →
              </button>
            </div>
          </div>
        </div>
      )}

      <TrustGesture state={gesture} />
    </main>
  );
}
