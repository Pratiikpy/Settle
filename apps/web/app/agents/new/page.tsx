"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { PactCard, TrustGesture, WaxSeal } from "@settle/ui";
import { W6AppShell } from "../../../components/w6-app-shell";
import { fireSettlementConfetti, trustGesture } from "../../../lib/confetti";
import { getSolscanUrl } from "../../../lib/solana";
import { LocaleSwitcher } from "../../../components/locale-switcher";
import { useTranslate } from "../../../lib/i18n";

/**
 * /agents — User journey #3: Hire an AI agent.
 *
 * Real flow:
 *   1. POST /api/agents/spawn → returns base64 unsigned open_pact tx + pact PDA
 *   2. Phantom signs the tx
 *   3. Submit via connection.sendRawTransaction
 *   4. Confirm; on success route to /cards/[pact-pubkey]
 */
export default function AgentsPage() {
  const router = useRouter();
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { t } = useTranslate();
  const [task, setTask] = useState("");
  const [cap, setCap] = useState("0.50");
  const [expiryMin, setExpiryMin] = useState(15);
  // Hardcoded demo merchants for V1 — replace with real verified_merchants query in V2
  const [merchants] = useState<string[]>([
    process.env.NEXT_PUBLIC_MERCHANT_ARXIV ?? "Arxv1111111111111111111111111111111111111a",
    process.env.NEXT_PUBLIC_MERCHANT_TRANSLATE ?? "Trns1111111111111111111111111111111111111a",
    process.env.NEXT_PUBLIC_MERCHANT_SUMMARY ?? "Sumr1111111111111111111111111111111111111a",
  ]);
  const merchantLabels = ["ArxivFetch", "TranslateAPI", "SummaryLLM"];
  const [gesture, setGesture] = useState<
    "idle" | "signing" | "confirming" | "success" | "error"
  >("idle");

  async function handleHire() {
    if (!task) {
      toast.error("Describe the task first.");
      return;
    }
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect a wallet to continue.");
      return;
    }

    trustGesture();
    setGesture("signing");

    try {
      // Generate a unique scope label per task to derive a fresh Pact PDA
      const scopeLabel = `pact-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      // For V1: assume the user's main card is labeled "main"
      const parentCardLabel = "main";

      // 1. Server builds the unsigned tx
      const buildRes = await fetch("/api/agents/spawn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authority: publicKey.toBase58(),
          parentCardLabel,
          scopeLabel,
          capUsdc: cap,
          merchantAllowlist: merchants,
          expiryMinutes: expiryMin,
        }),
      });
      if (!buildRes.ok) {
        const err = await buildRes.json();
        throw new Error(err.error ?? "build_failed");
      }
      const { transaction, pact } = (await buildRes.json()) as {
        transaction: string;
        pact: string;
      };

      // 2. Phantom signs
      const tx = Transaction.from(Buffer.from(transaction, "base64"));
      const signed = await signTransaction(tx);

      setGesture("confirming");

      // 3. Submit + confirm
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
      toast.success("Spending rule active. Watch the agent work.", {
        description: `Rule: ${pact.slice(0, 6)}…${pact.slice(-4)}`,
        action: {
          label: "Solscan ↗",
          onClick: () => window.open(getSolscanUrl(sig), "_blank"),
        },
      });

      setTimeout(() => router.push(`/cards/${pact}`), 1200);
    } catch (e) {
      setGesture("error");
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setTimeout(() => setGesture("idle"), 2400);
    }
  }

  return (
    <W6AppShell forceSurface="agent">
    <div>
      <div
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
            Agents
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.1 }}
          >
            {t("agents.hire_title")}
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
            {t("agents.hire_subtitle")}
          </p>
        </div>
        <LocaleSwitcher />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr,360px]">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void handleHire();
          }}
        >
          <div>
            <label className="block text-xs font-medium text-[#52525b]">Task</label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Translate this Japanese paper to English."
              rows={3}
              className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#52525b]">Cap (USDC)</label>
              <input
                value={cap}
                onChange={(e) => setCap(e.target.value)}
                placeholder="0.50"
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#52525b]">Expiry (min)</label>
              <input
                value={expiryMin}
                onChange={(e) => setExpiryMin(Number(e.target.value))}
                type="number"
                min={1}
                max={1440}
                className="mt-1 w-full rounded-lg border border-[#e4e4e7] bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#52525b]">
              Merchant allowlist (Solana Attestation Service verified)
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              {merchantLabels.map((m) => (
                <span
                  key={m}
                  className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-xs text-accent"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!connected || gesture !== "idle"}
            className="w-full w6-btn w6-btn-primary disabled:opacity-50"
          >
            {!connected
              ? "Connect a wallet to hire"
              : gesture === "signing"
                ? "Signing mandate…"
                : gesture === "confirming"
                  ? "Opening spending rule on Solana…"
                  : gesture === "success"
                    ? "Spending rule open ✓"
                    : "Open spending rule"}
          </button>

          <p className="text-xs text-[#52525b]">
            Anchor <code>open_pact</code> ix · Solana Pay reference · Solana Attestation Service ·
            Lighthouse assertion · Helius Sender.
          </p>
        </form>

        <div className="space-y-4">
          <div className="text-xs font-medium uppercase tracking-wider text-[#52525b]">
            Preview
          </div>
          <div className="relative">
            <PactCard
              label="Rule · Research"
              capUsdc={`$${parseFloat(cap || "0").toFixed(2)}`}
              usedUsdc="$0.00"
              fillPct={1}
              allowlist={merchantLabels}
              expiryLabel={`${expiryMin}:00`}
            />
            {/* M1 — wax seal stamps over the preview when the Pact opens.
                Auto-fades; the page redirects to /cards/[pact] in 1.2s
                so the seal is the last visual the user sees here. */}
            <div className="pointer-events-none absolute right-4 top-4">
              <WaxSeal active={gesture === "success"} inscription="PACT" size={88} />
            </div>
          </div>
        </div>
      </div>

      <TrustGesture state={gesture} />
    </div>
    </W6AppShell>
  );
}
