"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { TrustGesture } from "@settle/ui";
import { Footer } from "../../../components/footer";
import { fireSettlementConfetti, trustGesture } from "../../../lib/confetti";
import { getSolscanUrl } from "../../../lib/solana";

export default function SendViaLinkPage() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [escrow, setEscrow] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [gesture, setGesture] = useState<
    "idle" | "signing" | "confirming" | "success" | "error"
  >("idle");

  async function handleCreate() {
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect Phantom to send.");
      return;
    }
    if (!amount) {
      toast.error("Enter an amount.");
      return;
    }

    trustGesture();
    setGesture("signing");

    try {
      const buildRes = await fetch("/api/send/link/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: publicKey.toBase58(),
          amount,
          note,
        }),
      });
      const built = await buildRes.json();
      if (!buildRes.ok) throw new Error(built.error ?? "build_failed");

      const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
      const signed = await signTransaction(tx);

      setGesture("confirming");

      const txSig = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature: txSig,
          blockhash: built.blockhash,
          lastValidBlockHeight: built.last_valid_block_height,
        },
        "confirmed",
      );

      const claimUrl = `${window.location.origin}/claim/${built.escrow_pubkey}#${built.escrow_secret_b58}`;
      setLink(claimUrl);
      setEscrow(built.escrow_pubkey);
      setSig(txSig);
      setGesture("success");
      fireSettlementConfetti();
      toast.success(`Link created. Anyone with this URL claims $${amount}.`);
    } catch (e) {
      setGesture("error");
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setTimeout(() => setGesture("idle"), 2000);
    }
  }

  return (
    <>
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Send via link</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Drop USDC into a one-time claim link. Send by SMS, email, or QR. Recipient claims with
          their own wallet — they don&apos;t need a Settle account.
        </p>

        {!link ? (
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleCreate();
            }}
          >
            <div>
              <label className="block text-xs font-medium text-foreground/60">Amount (USDC)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="5.00"
                inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground/60">Note (optional)</label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="happy birthday"
                maxLength={200}
                className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
              />
            </div>
            <button
              type="submit"
              disabled={!connected || gesture !== "idle"}
              className="w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
            >
              {!connected
                ? "Connect Phantom to send"
                : gesture === "signing"
                  ? "Signing escrow…"
                  : gesture === "confirming"
                    ? "Funding link…"
                    : "Create claim link"}
            </button>
            <p className="text-[11px] text-foreground/45">
              ~0.003 SOL covers escrow rent and gas. Refunded to the recipient on claim.
            </p>
          </form>
        ) : (
          <div className="mt-8 space-y-5">
            <div className="rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
              <div className="text-[10px] uppercase tracking-wider text-foreground/45">
                Claim link
              </div>
              <code className="mt-2 block break-all text-xs text-foreground/80">{link}</code>
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(link);
                  toast.success("Copied.");
                }}
                className="mt-4 w-full rounded-full border border-foreground/20 py-2 text-xs hover:bg-foreground/5"
              >
                Copy link
              </button>
            </div>
            {sig && (
              <a
                href={getSolscanUrl(sig)}
                target="_blank"
                rel="noreferrer"
                className="block text-center text-xs text-accent hover:underline"
              >
                Funding tx on Solscan ↗
              </a>
            )}
            <p className="text-[11px] text-foreground/45">
              Whoever opens this URL claims the funds. The secret lives only in the URL fragment
              (after the #) — it never reached our server. Treat the link like cash.
            </p>
            {escrow && (
              <div className="text-[11px] text-foreground/40">
                Escrow address: <code className="text-foreground/60">{escrow}</code>
              </div>
            )}
          </div>
        )}

        <TrustGesture state={gesture} />
      </main>
      <Footer />
    </>
  );
}
