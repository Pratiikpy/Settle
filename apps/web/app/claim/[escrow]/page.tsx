"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { toast } from "sonner";
import bs58 from "bs58";
import { TrustGesture } from "@settle/ui";
import { Footer } from "../../../components/footer";
import { fireSettlementConfetti, trustGesture } from "../../../lib/confetti";
import { getSolscanUrl } from "../../../lib/solana";

const USDC_MINTS = {
  mainnet: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
};

/**
 * /claim/[escrow]#<base58-secret>
 *
 * The URL fragment carries the escrow keypair secret. Browsers strip fragments
 * from HTTP requests, so the server never sees this value. We decode it client-
 * side, fetch a build of the claim tx, sign with both the escrow keypair (loaded
 * from the fragment) and the recipient's wallet (Phantom), then submit.
 */
export default function ClaimPage() {
  const params = useParams<{ escrow: string }>();
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [secret, setSecret] = useState<string | null>(null);
  const [escrowKey, setEscrowKey] = useState<Keypair | null>(null);
  const [status, setStatus] = useState<"idle" | "claiming" | "done" | "error">("idle");
  const [gesture, setGesture] = useState<
    "idle" | "signing" | "confirming" | "success" | "error"
  >("idle");
  const [sig, setSig] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewAmount, setPreviewAmount] = useState<string | null>(null);
  const [escrowEmpty, setEscrowEmpty] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const frag = window.location.hash.replace(/^#/, "");
    if (!frag) {
      setError("No claim secret in URL. The link is incomplete.");
      return;
    }
    try {
      const secret = bs58.decode(frag);
      const kp = Keypair.fromSecretKey(secret);
      if (kp.publicKey.toBase58() !== params.escrow) {
        setError("Claim secret doesn't match escrow address.");
        return;
      }
      setSecret(frag);
      setEscrowKey(kp);
    } catch {
      setError("Invalid claim secret.");
    }
  }, [params.escrow]);

  // F11 polish — preview escrow USDC balance BEFORE the user connects a wallet.
  // Motivates the wallet-connect step ("$5 waiting for you" beats a cold "Claim USDC" CTA).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";
        const usdcMint = new PublicKey(
          cluster === "mainnet" ? USDC_MINTS.mainnet : USDC_MINTS.devnet,
        );
        const escrowPubkey = new PublicKey(params.escrow);
        const escrowAta = getAssociatedTokenAddressSync(usdcMint, escrowPubkey, true);
        try {
          const account = await getAccount(connection, escrowAta);
          if (cancelled) return;
          const usdc = (Number(account.amount.toString()) / 1_000_000).toFixed(2);
          if (account.amount === 0n) {
            setEscrowEmpty(true);
          } else {
            setPreviewAmount(usdc);
          }
        } catch {
          // ATA missing → empty escrow
          if (!cancelled) setEscrowEmpty(true);
        }
      } catch {
        // ignore — preview is best-effort, the real check happens in /api/send/link/claim
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.escrow, connection]);

  async function handleClaim() {
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect Phantom to claim.");
      return;
    }
    if (!escrowKey) return;

    trustGesture();
    setGesture("signing");
    setStatus("claiming");

    try {
      const buildRes = await fetch("/api/send/link/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escrow_pubkey: escrowKey.publicKey.toBase58(),
          recipient: publicKey.toBase58(),
        }),
      });
      const built = await buildRes.json();
      if (!buildRes.ok) {
        throw new Error(built.error ?? "build_failed");
      }

      setAmount(built.amount_usdc);

      const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
      // Co-sign with escrow keypair first (partial-sign), then ask Phantom to sign.
      tx.partialSign(escrowKey);
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
      setSig(txSig);
      setStatus("done");
      setGesture("success");
      fireSettlementConfetti();
      toast.success(`Claimed $${built.amount_usdc} USDC.`, {
        action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(txSig), "_blank") },
      });
    } catch (e) {
      setStatus("error");
      setGesture("error");
      setError((e as Error).message);
      toast.error(`Failed: ${(e as Error).message}`);
    } finally {
      setTimeout(() => setGesture("idle"), 2400);
    }
  }

  return (
    <>
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">
          {previewAmount ? `$${previewAmount} is yours` : "Claim USDC"}
        </h1>
        <p className="mt-2 text-sm text-foreground/60">
          {previewAmount
            ? "Connect Phantom to receive it. Settles in under a second."
            : "Someone sent you money via a Settle link. Connect your wallet to claim."}
        </p>

        {/* Hero amount card — appears when balance is known, before wallet connect */}
        {previewAmount && status !== "done" && (
          <div className="mt-8 rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-emerald-400/15 to-accent/10 p-8 text-center">
            <div className="text-[11px] uppercase tracking-wider text-foreground/55">Pending</div>
            <div className="mt-2 text-5xl font-semibold tracking-tight">${previewAmount}</div>
            <div className="mt-1 text-[11px] text-foreground/45">USDC</div>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-6">
          <div className="text-[10px] uppercase tracking-wider text-foreground/45">Escrow</div>
          <code className="mt-1 block break-all text-xs text-foreground/70">{params.escrow}</code>

          {escrowEmpty && status !== "done" && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              This escrow is empty — funds may have already been claimed.
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-300">
              {error}
            </div>
          )}

          {status === "done" && sig ? (
            <div className="mt-6 grid gap-3">
              <p className="text-sm font-medium text-emerald-300">
                ✓ Claimed ${amount ?? ""} USDC
              </p>
              <a
                href={getSolscanUrl(sig)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent underline"
              >
                View on Solscan ↗
              </a>
            </div>
          ) : (
            <button
              onClick={() => void handleClaim()}
              disabled={!secret || !connected || gesture === "signing" || gesture === "confirming"}
              className="mt-6 w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
            >
              {!connected
                ? "Connect Phantom to claim"
                : gesture === "signing"
                  ? "Signing claim…"
                  : gesture === "confirming"
                    ? "Confirming…"
                    : "Claim USDC"}
            </button>
          )}
        </div>
        <p className="mt-4 text-[11px] text-foreground/40">
          The claim secret lives in the URL fragment (#) and never reaches Settle&apos;s servers.
          Anyone with this URL can claim — keep it private.
        </p>

        <TrustGesture state={gesture} />
      </main>
      <Footer />
    </>
  );
}
