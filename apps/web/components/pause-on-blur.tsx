"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { trustGesture } from "../lib/confetti";
import { getSolscanUrl } from "../lib/solana";

/**
 * Pause-on-blur — the demo gem.
 *
 * Watches `document.visibilitychange`. When the tab is HIDDEN with an active
 * (non-paused) streaming pact, it tracks the elapsed wall-clock and computes
 * the lamports that would have leaked at the pact's rate. When the tab returns
 * to VISIBLE, a banner surfaces the computed waste and offers a one-click
 * "Pause now" that fires the existing /api/streaming-pacts/[id]/pause flow
 * (wallet-signed by the authority).
 *
 * Why on-return-only by default:
 *   Phantom can't sign while the tab is blurred. Auto-firing the pause ix on
 *   visibilitychange→hidden would dispatch a wallet popup the user can't see.
 *   Bad UX. So we surface the prompt when they come back.
 *
 * Power-user opt-in:
 *   The "auto-pause" toggle dispatches the pause ix the moment the tab blurs
 *   — Phantom popup will be waiting when the user returns. For users who keep
 *   Phantom in a separate window or have approve-without-prompt configured.
 *
 * Tab title indicator:
 *   While the tab is hidden AND the pact is still active, document.title is
 *   prefixed with 🔴 so the user notices in their tab list. Cleared on focus.
 *
 * The component does NOT touch the on-chain pact directly — it composes with
 * the existing pause flow. Demo line: "watch — I lose tab focus, the on-chain
 * stream pauses in 0.4 s, I refocus and it resumes. That's only possible
 * because the chain is fast."
 */

export interface PauseOnBlurProps {
  pactPubkey: string;
  scopeLabel: string;
  ratePerSlot: bigint;
  paused: boolean;
  /** Called after a successful pause/resume so the parent can refresh state. */
  onChanged?: () => void;
}

const SLOT_MS = 400;

function lamportsToUsd(v: bigint): string {
  const whole = v / 1_000_000n;
  const frac = v % 1_000_000n;
  return `$${whole}.${frac.toString().padStart(6, "0").slice(0, 4)}`;
}

export function PauseOnBlur({
  pactPubkey,
  scopeLabel,
  ratePerSlot,
  paused,
  onChanged,
}: PauseOnBlurProps) {
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [autoPauseEnabled, setAutoPauseEnabled] = useState(false);
  const [busy, setBusy] = useState<"idle" | "pausing" | "resuming">("idle");
  const [hiddenAt, setHiddenAt] = useState<number | null>(null);
  // Banner shown on return — survives until user clicks pause/dismiss.
  const [returnBanner, setReturnBanner] = useState<{
    hiddenMs: number;
    leakedLamports: bigint;
  } | null>(null);

  const originalTitleRef = useRef<string | null>(null);

  /** Persist original title once on mount so we can restore it cleanly. */
  useEffect(() => {
    if (typeof document !== "undefined" && originalTitleRef.current === null) {
      originalTitleRef.current = document.title;
    }
  }, []);

  /**
   * Fire the on-chain pause via the existing wallet-signed flow.
   *
   * This is shared between manual click ("Pause now" banner button) and
   * auto-fire-on-blur (power-user toggle). Returns true on success.
   */
  async function firePause(): Promise<boolean> {
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect Phantom to pause.");
      return false;
    }
    if (paused) return true; // already paused
    setBusy("pausing");
    try {
      const r = await fetch(`/api/streaming-pacts/${pactPubkey}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authority: publicKey.toBase58() }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.message ?? d.error ?? "pause_failed");
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
      toast.success(`Stream paused on-chain in <0.5 s.`, {
        action: {
          label: "Solscan ↗",
          onClick: () => window.open(getSolscanUrl(sig), "_blank"),
        },
      });
      onChanged?.();
      return true;
    } catch (e) {
      toast.error(`Pause failed: ${(e as Error).message}`);
      return false;
    } finally {
      setBusy("idle");
    }
  }

  /**
   * Visibility handler: tracks hidden duration and (optionally) auto-fires.
   *
   * The handler closes over `paused` + `autoPauseEnabled` + `ratePerSlot` so
   * we re-register on each change to keep semantics fresh. Avoid useRef'ing
   * those — fewer moving parts is fewer bugs.
   */
  useEffect(() => {
    if (typeof document === "undefined") return;

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        // Don't track if pact is already paused — no waste accruing anyway.
        if (paused) return;
        const ts = Date.now();
        setHiddenAt(ts);

        // Tab title indicator.
        if (originalTitleRef.current && ratePerSlot > 0n) {
          document.title = `🔴 Streaming live · ${scopeLabel} — Settle`;
        }

        // Power-user auto-pause path.
        if (autoPauseEnabled) {
          // Fire immediately. Phantom popup will be queued for when the user
          // returns to the browser.
          void firePause();
        }
      } else if (document.visibilityState === "visible") {
        // Restore title.
        if (originalTitleRef.current) {
          document.title = originalTitleRef.current;
        }

        if (hiddenAt !== null) {
          const hiddenMs = Date.now() - hiddenAt;
          // Only show banner if we were hidden long enough to compute non-trivial waste.
          if (hiddenMs >= 1500 && ratePerSlot > 0n && !paused) {
            // wasted_lamports = (hiddenMs / SLOT_MS) × ratePerSlot
            const slotsTicked = BigInt(Math.floor(hiddenMs / SLOT_MS));
            const leaked = slotsTicked * ratePerSlot;
            setReturnBanner({ hiddenMs, leakedLamports: leaked });
          }
          setHiddenAt(null);
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Restore title on unmount.
      if (originalTitleRef.current && document.title !== originalTitleRef.current) {
        document.title = originalTitleRef.current;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, autoPauseEnabled, ratePerSlot, scopeLabel, hiddenAt]);

  return (
    <div className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.02] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[11px] text-foreground/55">
          Pause-on-blur
          <span className="ml-2 text-foreground/35">
            {autoPauseEnabled
              ? "auto-pause on tab blur"
              : "prompt to pause on tab return"}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAutoPauseEnabled((v) => !v)}
          className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
            autoPauseEnabled
              ? "bg-amber-500/90 text-background hover:bg-amber-400"
              : "border border-foreground/15 text-foreground/60 hover:bg-foreground/5"
          }`}
          title={
            autoPauseEnabled
              ? "Auto-pause is ON. The pause ix fires the moment the tab blurs; Phantom popup will be queued."
              : "Auto-pause is OFF. We'll prompt you when you return to the tab."
          }
        >
          Auto-pause: {autoPauseEnabled ? "ON" : "OFF"}
        </button>
      </div>

      {returnBanner && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
          <div className="text-[11px] text-amber-300">
            Tab was hidden for{" "}
            <span className="font-mono">
              {(returnBanner.hiddenMs / 1000).toFixed(1)} s
            </span>{" "}
            ≈{" "}
            <span className="font-mono font-medium">
              {lamportsToUsd(returnBanner.leakedLamports)}
            </span>{" "}
            leaked at the current rate.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                const ok = await firePause();
                if (ok) setReturnBanner(null);
              }}
              disabled={busy !== "idle"}
              className="rounded-full bg-accent px-3 py-1.5 text-[11px] font-medium text-background disabled:opacity-50"
            >
              {busy === "pausing" ? "Pausing on-chain…" : "Pause now (≈0.4 s)"}
            </button>
            <button
              type="button"
              onClick={() => setReturnBanner(null)}
              className="rounded-full border border-foreground/15 px-3 py-1.5 text-[11px] hover:bg-foreground/5"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
