"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { WalletButton } from "../../components/wallet-button-client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { SettleCard, TrustGesture } from "@settle/ui";
import { W6AppShell } from "../../components/w6-app-shell";
import { fireSettlementConfetti, trustGesture } from "../../lib/confetti";
import { getSolscanUrl } from "../../lib/solana";

/**
 * /onboarding — Guided ≤60s flow for first-time users.
 *
 * Steps:
 *   1. Connect a wallet
 *   2. Sandbox airdrop (0.5 SOL + 25 test-USDC)
 *   3. Create your first AgentCard ("main")
 *   4. Done — redirect to the new card detail page
 *
 * Each step has its own success/error state. The progress bar shows where you are.
 */

type Step = 1 | 2 | 3 | 4;

export default function OnboardingPage() {
  const router = useRouter();
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [step, setStep] = useState<Step>(1);
  const [funded, setFunded] = useState(false);
  const [funding, setFunding] = useState(false);
  // F1.4 — when the sandbox airdrop fails (rate-limited / faucet dry),
  // we show the manual fallback. The error surfaces inline; no toast-and-
  // forget that leaves the user stranded.
  const [fundError, setFundError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdCard, setCreatedCard] = useState<{
    cardPubkey: string;
    agentSecret: string;
    sig: string;
  } | null>(null);
  const [gesture, setGesture] = useState<
    "idle" | "signing" | "confirming" | "success" | "error"
  >("idle");

  // Auto-advance from step 1 → step 2 when wallet connects
  useEffect(() => {
    if (connected && step === 1) setStep(2);
  }, [connected, step]);

  async function handleFund() {
    if (!publicKey) return;
    setFunding(true);
    try {
      const res = await fetch("/api/sandbox/airdrop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: publicKey.toBase58() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "airdrop_failed");
      }
      setFunded(true);
      fireSettlementConfetti();
      toast.success("0.5 SOL + test-USDC airdropped");
      setStep(3);
    } catch (e) {
      // F1.4 — devnet airdrop is rate-limited per IP and can be down for
      // hours at a time. Surface the manual-faucet path instead of a
      // generic toast that leaves the user stuck.
      setFundError((e as Error).message);
      toast.error(
        `Airdrop unavailable. We'll show you the manual faucet — same outcome, 60 seconds.`,
      );
    } finally {
      setFunding(false);
    }
  }

  async function handleCreateCard() {
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect a wallet first.");
      return;
    }
    trustGesture();
    setGesture("signing");
    setCreating(true);

    try {
      const res = await fetch("/api/agents/create-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authority: publicKey.toBase58(),
          label: "main",
          dailyCapUsdc: "25.00",
          perCallMaxUsdc: "1.00",
          merchantAllowlist: [
            process.env.NEXT_PUBLIC_MERCHANT_ARXIV ?? "Arxv1111111111111111111111111111111111111a",
            process.env.NEXT_PUBLIC_MERCHANT_TRANSLATE ?? "Trns1111111111111111111111111111111111111a",
            process.env.NEXT_PUBLIC_MERCHANT_SUMMARY ?? "Sumr1111111111111111111111111111111111111a",
          ],
          expiryDays: 30,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "build_failed");
      }
      const data = (await res.json()) as {
        transaction: string;
        card_pubkey: string;
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
      setCreatedCard({
        cardPubkey: data.card_pubkey,
        agentSecret: data.agent_secret_b58,
        sig,
      });
      setStep(4);
      toast.success("Onboarding complete.", {
        action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(sig), "_blank") },
      });
    } catch (e) {
      setGesture("error");
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setCreating(false);
      setTimeout(() => setGesture("idle"), 2400);
    }
  }

  function copyAgentSecret() {
    if (!createdCard) return;
    void navigator.clipboard.writeText(createdCard.agentSecret);
    toast.success("Agent secret copied. Save as SETTLE_AGENT_PRIVKEY.");
  }

  function goToCard() {
    if (!createdCard) return;
    router.push(`/cards/${createdCard.cardPubkey}`);
  }

  const stepLabels = ["Connect", "Get devnet funds", "Create card", "Done"];

  return (
    <W6AppShell>
    <div style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={{ marginBottom: 28, textAlign: "center" }}>
        <div className="w6-eyebrow" style={{ fontSize: 12 }}>
          Welcome
        </div>
        <h1
          className="w6-heading"
          style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
        >
          Get started in 60 seconds.
        </h1>
        <p
          className="w6-muted"
          style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5 }}
        >
          Four quick steps. Real Solana devnet — no mocks.
        </p>
      </div>

      {/* Step indicator — matches prototype's circle + line pattern */}
      <div
        style={{
          display: "flex",
          gap: 6,
          marginBottom: 28,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {stepLabels.map((label, i) => {
          const stepNum = (i + 1) as Step;
          const isActive = stepNum === step;
          const isDone = stepNum < step;
          return (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                opacity: stepNum <= step ? 1 : 0.5,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: isDone ? "var(--w6-ink)" : "#fff",
                  color: isDone ? "#fff" : "var(--w6-ink)",
                  border: isActive
                    ? "1.5px solid var(--w6-ink)"
                    : "1px solid var(--w6-rule)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {isDone ? "✓" : stepNum}
              </div>
              <span
                style={{
                  fontSize: 12.5,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive
                    ? "var(--w6-ink)"
                    : isDone
                      ? "var(--w6-ink-2)"
                      : "var(--w6-ink-4)",
                }}
              >
                {label}
              </span>
              {i < stepLabels.length - 1 && (
                <div
                  style={{
                    width: 22,
                    height: 1,
                    background: isDone ? "var(--w6-ink)" : "var(--w6-rule)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1: Connect */}
        {step === 1 && (
          <motion.section
            key="step-1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-8"
          >
            <h2 className="text-xl font-medium">Connect your wallet</h2>
            <p className="mt-2 text-sm text-[#52525b]">
              Phantom is the smoothest. Your wallet stays in your control — Settle never sees
              your private keys.
            </p>
            <div className="mt-6">
              <WalletButton />
            </div>
          </motion.section>
        )}

        {/* Step 2: Sandbox airdrop */}
        {step === 2 && (
          <motion.section
            key="step-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-8"
          >
            <h2 className="text-xl font-medium">Get devnet funds</h2>
            <p className="mt-2 text-sm text-[#52525b]">
              We&apos;ll airdrop 0.5 SOL (for tx fees) + 25 test-USDC to your wallet so you
              can pay for things on devnet.
            </p>
            <button
              onClick={() => void handleFund()}
              disabled={funding || funded}
              className="mt-6 w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
            >
              {funded ? "Funded ✓" : funding ? "Airdropping…" : "Get funds"}
            </button>
            <p className="mt-3 text-xs text-[#71717a]">
              Devnet only · One airdrop per wallet per 24h
            </p>

            {/* F1.4 — manual fallback when the sandbox airdrop fails. The
                Solana faucet is rate-limited per IP; the Circle faucet is
                gated by reCAPTCHA. Either way the user can finish in <60s
                with a copy-paste of their address. */}
            {fundError && publicKey && (
              <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/[0.05] p-4 text-left">
                <p className="text-sm font-medium text-amber-300">
                  Airdrop is offline right now.
                </p>
                <p className="mt-1 text-xs text-amber-200/70">
                  Devnet faucets are rate-limited per IP. Use either of these
                  manual paths and you&apos;ll be ready in under a minute.
                </p>
                <div className="mt-3 grid gap-2 text-[11px]">
                  <div className="flex items-baseline justify-between gap-3 rounded-lg bg-[#fafafa] p-2 font-mono">
                    <span className="break-all">{publicKey.toBase58()}</span>
                    <button
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(publicKey.toBase58())
                          .then(() => toast.success("Address copied"));
                      }}
                      className="shrink-0 rounded-full border border-[#a1a1aa] px-2 py-0.5 text-[10px] hover:bg-[#e4e4e7]"
                    >
                      copy
                    </button>
                  </div>
                  <a
                    href="https://faucet.solana.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center justify-center rounded-full border border-[#a1a1aa] px-4 text-xs hover:bg-[#f4f4f5]"
                  >
                    Step 1 — get devnet SOL on faucet.solana.com →
                  </a>
                  <a
                    href="https://faucet.circle.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center justify-center rounded-full border border-[#a1a1aa] px-4 text-xs hover:bg-[#f4f4f5]"
                  >
                    Step 2 — get devnet USDC on faucet.circle.com →
                  </a>
                </div>
                <button
                  onClick={() => {
                    setFundError(null);
                    setFunded(true);
                    setStep(3);
                  }}
                  className="mt-3 w-full rounded-full border border-amber-400/30 py-2 text-xs text-amber-300 hover:bg-amber-400/10"
                >
                  I&apos;ve funded my wallet manually — continue
                </button>
              </div>
            )}
          </motion.section>
        )}

        {/* Step 3: Create card */}
        {step === 3 && (
          <motion.section
            key="step-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid gap-6 lg:grid-cols-[1fr,280px]"
          >
            <div className="rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-8">
              <h2 className="text-xl font-medium">Create your card</h2>
              <p className="mt-2 text-sm text-[#52525b]">
                Your AgentCard scopes how much AI agents can spend on your behalf. We&apos;ll
                set sensible defaults — you can edit anytime.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-[#e4e4e7] p-3">
                  <div className="text-xs text-[#52525b]">Daily cap</div>
                  <div className="mt-0.5 font-mono">$25.00</div>
                </div>
                <div className="rounded-lg border border-[#e4e4e7] p-3">
                  <div className="text-xs text-[#52525b]">Per-call max</div>
                  <div className="mt-0.5 font-mono">$1.00</div>
                </div>
                <div className="rounded-lg border border-[#e4e4e7] p-3">
                  <div className="text-xs text-[#52525b]">Allowlist</div>
                  <div className="mt-0.5 text-xs">3 demo merchants</div>
                </div>
                <div className="rounded-lg border border-[#e4e4e7] p-3">
                  <div className="text-xs text-[#52525b]">Expires</div>
                  <div className="mt-0.5 text-xs">30 days</div>
                </div>
              </div>

              <button
                onClick={() => void handleCreateCard()}
                disabled={creating}
                className="mt-6 w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create AgentCard"}
              </button>
            </div>

            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-[#52525b]">
                Preview
              </div>
              <div className="mt-3">
                <SettleCard
                  handle={publicKey ? `@${publicKey.toBase58().slice(0, 6)}` : "@me"}
                  balance="$25.00"
                  symbol="main"
                  subline="30d · per-call $1.00"
                  variant="main"
                />
              </div>
            </div>
          </motion.section>
        )}

        {/* Step 4: Done */}
        {step === 4 && createdCard && (
          <motion.section
            key="step-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-accent/30 bg-accent/5 p-8"
          >
            <h2 className="text-xl font-medium text-accent">✓ You&apos;re ready</h2>
            <p className="mt-2 text-sm text-[#27272a]">
              Your AgentCard is live on Solana devnet. Save the agent secret below — it lets you
              run the demo agent locally.
            </p>

            <div className="mt-6 space-y-3 text-xs">
              <div>
                <div className="text-[#52525b]">Card PDA</div>
                <code className="mt-1 block break-all font-mono">{createdCard.cardPubkey}</code>
              </div>
              <div>
                <div className="text-[#52525b]">Agent secret (sensitive)</div>
                <code className="mt-1 block break-all font-mono text-[#71717a]">
                  {createdCard.agentSecret.slice(0, 16)}…
                </code>
                <button
                  onClick={copyAgentSecret}
                  className="mt-2 rounded-full border border-[#a1a1aa] px-4 py-1.5 text-xs hover:bg-[#f4f4f5]"
                >
                  Copy full secret
                </button>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={goToCard}
                className="rounded-full bg-accent px-6 py-2 text-sm font-medium text-background"
              >
                Open my card →
              </button>
              <a
                href={getSolscanUrl(createdCard.sig)}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-[#a1a1aa] px-6 py-2 text-sm hover:bg-[#f4f4f5]"
              >
                Solscan ↗
              </a>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <TrustGesture state={gesture} />
    </div>
    </W6AppShell>
  );
}
