"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { SettleCard, TrustGesture } from "@settle/ui";
import { fireSettlementConfetti, trustGesture } from "../../lib/confetti";
import { getSolscanUrl } from "../../lib/solana";

/**
 * /onboarding — Guided ≤60s flow for first-time users.
 *
 * Steps:
 *   1. Connect Phantom
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
      toast.error(`Airdrop failed: ${(e as Error).message}`);
    } finally {
      setFunding(false);
    }
  }

  async function handleCreateCard() {
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect Phantom first.");
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
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Get started in 60 seconds</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Four quick steps. Real Solana devnet — no mocks.
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-10">
        <div className="flex items-center justify-between text-xs">
          {stepLabels.map((label, i) => {
            const stepNum = (i + 1) as Step;
            const isActive = stepNum === step;
            const isDone = stepNum < step;
            return (
              <div key={label} className="flex flex-1 items-center">
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold ${
                    isDone
                      ? "bg-accent text-background"
                      : isActive
                        ? "border-2 border-accent text-accent"
                        : "border border-foreground/20 text-foreground/40"
                  }`}
                >
                  {isDone ? "✓" : stepNum}
                </div>
                <span
                  className={`ml-2 mr-2 text-xs ${
                    isActive
                      ? "font-medium text-foreground"
                      : isDone
                        ? "text-accent"
                        : "text-foreground/40"
                  }`}
                >
                  {label}
                </span>
                {i < stepLabels.length - 1 && (
                  <div
                    className={`mx-1 h-px flex-1 ${
                      isDone ? "bg-accent" : "bg-foreground/10"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1: Connect */}
        {step === 1 && (
          <motion.section
            key="step-1"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-2xl border border-foreground/10 bg-white/[0.02] p-8"
          >
            <h2 className="text-xl font-medium">Connect your wallet</h2>
            <p className="mt-2 text-sm text-foreground/60">
              Phantom is the smoothest. Your wallet stays in your control — Settle never sees
              your private keys.
            </p>
            <div className="mt-6">
              <WalletMultiButton />
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
            className="rounded-2xl border border-foreground/10 bg-white/[0.02] p-8"
          >
            <h2 className="text-xl font-medium">Get devnet funds</h2>
            <p className="mt-2 text-sm text-foreground/60">
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
            <p className="mt-3 text-xs text-foreground/40">
              Devnet only · One airdrop per wallet per 24h
            </p>
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
            <div className="rounded-2xl border border-foreground/10 bg-white/[0.02] p-8">
              <h2 className="text-xl font-medium">Create your card</h2>
              <p className="mt-2 text-sm text-foreground/60">
                Your AgentCard scopes how much AI agents can spend on your behalf. We&apos;ll
                set sensible defaults — you can edit anytime.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border border-foreground/10 p-3">
                  <div className="text-xs text-foreground/50">Daily cap</div>
                  <div className="mt-0.5 font-mono">$25.00</div>
                </div>
                <div className="rounded-lg border border-foreground/10 p-3">
                  <div className="text-xs text-foreground/50">Per-call max</div>
                  <div className="mt-0.5 font-mono">$1.00</div>
                </div>
                <div className="rounded-lg border border-foreground/10 p-3">
                  <div className="text-xs text-foreground/50">Allowlist</div>
                  <div className="mt-0.5 text-xs">3 demo merchants</div>
                </div>
                <div className="rounded-lg border border-foreground/10 p-3">
                  <div className="text-xs text-foreground/50">Expires</div>
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
              <div className="text-xs font-medium uppercase tracking-wider text-foreground/50">
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
            <p className="mt-2 text-sm text-foreground/70">
              Your AgentCard is live on Solana devnet. Save the agent secret below — it lets you
              run the demo agent locally.
            </p>

            <div className="mt-6 space-y-3 text-xs">
              <div>
                <div className="text-foreground/50">Card PDA</div>
                <code className="mt-1 block break-all font-mono">{createdCard.cardPubkey}</code>
              </div>
              <div>
                <div className="text-foreground/50">Agent secret (sensitive)</div>
                <code className="mt-1 block break-all font-mono text-foreground/40">
                  {createdCard.agentSecret.slice(0, 16)}…
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
                className="rounded-full border border-foreground/20 px-6 py-2 text-sm hover:bg-foreground/5"
              >
                Solscan ↗
              </a>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <TrustGesture state={gesture} />
    </main>
  );
}
