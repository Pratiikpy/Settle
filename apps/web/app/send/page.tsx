"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { toast } from "sonner";
import { TrustGesture } from "@settle/ui";
import { fireSettlementConfetti, trustGesture } from "../../lib/confetti";
import { parseHandleInput, displayHandle } from "@settle/sdk";
import { getSolscanUrl, NETWORK_NAME, getUsdcMint } from "../../lib/solana";
import { TokenPicker, type SelectedToken } from "../../components/token-picker";
import { ScreenshotDropzone } from "../../components/screenshot-dropzone";

/**
 * F12 — Pay With Any Token.
 *
 * USDC stays the dominant happy path (works on devnet today, mainnet tomorrow). Any
 * non-USDC mint shows a live Jupiter quote and is honest about devnet vs mainnet:
 *   • devnet  → quote shown for reference, swap+send disabled (no devnet liquidity)
 *   • mainnet → swap composed via Jupiter and sent in a single v0 versioned tx
 *
 * The single endpoint at /api/swap/quote-and-build returns the right thing for each
 * combination of (cluster × inputMint), so this page stays one code path.
 */

const cluster: "mainnet" | "devnet" = NETWORK_NAME === "mainnet" ? "mainnet" : "devnet";
const USDC_MINT = getUsdcMint();

const DEFAULT_TOKEN: SelectedToken = {
  mint: USDC_MINT,
  symbol: "USDC",
  decimals: 6,
};

interface QuoteSummary {
  in_amount: string;
  out_amount: string;
  price_impact_pct: string;
  slippage_bps: number;
  route: string[];
}

type Mode = "direct_usdc" | "jupiter_swap" | "mainnet_only";

export default function SendPage() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [token, setToken] = useState<SelectedToken>(DEFAULT_TOKEN);
  const [resolved, setResolved] = useState<{ handle: string; pubkey: string } | null>(null);
  const [gesture, setGesture] = useState<
    "idle" | "signing" | "confirming" | "success" | "error"
  >("idle");
  const [lastSig, setLastSig] = useState<string | null>(null);

  // Quote state
  const [quote, setQuote] = useState<QuoteSummary | null>(null);
  const [quoteMode, setQuoteMode] = useState<Mode | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const isUsdc = token.mint === USDC_MINT;

  async function handleResolve() {
    if (!recipient.trim()) return;
    try {
      const parsed = parseHandleInput(recipient);
      const res = await fetch(`/api/resolve?handle=${encodeURIComponent(recipient)}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "resolution_failed");
      }
      const data = await res.json();
      setResolved({ handle: displayHandle(parsed), pubkey: data.pubkey });
    } catch (e) {
      toast.error(`Could not resolve: ${(e as Error).message}`);
      setResolved(null);
    }
  }

  // Convert decimal amount → atomic, returns null if invalid.
  const inputAmountAtomic = useMemo(() => {
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) return null;
    const scaled = Math.round(n * 10 ** token.decimals);
    if (scaled <= 0) return null;
    return BigInt(scaled).toString();
  }, [amount, token.decimals]);

  // Live quote for non-USDC inputs. Debounce 350ms to respect Jupiter Lite ~60 rpm.
  useEffect(() => {
    if (isUsdc) {
      setQuote(null);
      setQuoteMode(null);
      setQuoteError(null);
      setQuoteLoading(false);
      return;
    }
    if (!resolved || !publicKey || !inputAmountAtomic) {
      setQuote(null);
      setQuoteError(null);
      setQuoteMode(null);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    setQuoteError(null);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/swap/quote-and-build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: publicKey.toBase58(),
            to: resolved.pubkey,
            inputMint: token.mint,
            inputAmountAtomic,
          }),
        });
        const data = (await res.json()) as
          | {
              ok: true;
              mode: Mode;
              quote?: QuoteSummary;
              quote_error?: string;
              message?: string;
            }
          | { error: string; message?: string };
        if (cancelled) return;
        if ("error" in data) {
          setQuote(null);
          setQuoteMode(null);
          setQuoteError(data.message ?? data.error);
        } else {
          setQuote(data.quote ?? null);
          setQuoteMode(data.mode);
          setQuoteError(data.quote_error ?? null);
        }
      } catch (e) {
        if (!cancelled) setQuoteError((e as Error).message);
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isUsdc, token.mint, inputAmountAtomic, resolved, publicKey]);

  async function handleSend() {
    if (!resolved) {
      await handleResolve();
      return;
    }
    if (!inputAmountAtomic) {
      toast.error("Enter an amount.");
      return;
    }
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect Phantom to send.");
      return;
    }

    // Devnet + non-USDC → swap is mainnet-only. Refuse with a useful message.
    if (!isUsdc && cluster === "devnet") {
      toast.error("Multi-token swap activates on mainnet. Pick USDC to send today.");
      return;
    }

    trustGesture(parseFloat(amount));
    setGesture("signing");
    try {
      const buildRes = await fetch("/api/swap/quote-and-build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: publicKey.toBase58(),
          to: resolved.pubkey,
          inputMint: token.mint,
          inputAmountAtomic,
          note: note || undefined,
        }),
      });
      const built = (await buildRes.json()) as
        | {
            ok: true;
            mode: Mode;
            transaction: string;
            is_versioned?: boolean;
            blockhash: string;
            last_valid_block_height: number;
            reference: string;
            quote?: QuoteSummary;
          }
        | { error: string; message?: string };
      if ("error" in built) {
        throw new Error(built.message ?? built.error);
      }
      if (built.mode === "mainnet_only") {
        throw new Error("Swap requires mainnet. Pick USDC instead.");
      }

      const txBytes = Buffer.from(built.transaction, "base64");
      let signed: Transaction | VersionedTransaction;
      let blockhash = built.blockhash;
      let lastValidBlockHeight = built.last_valid_block_height;

      if (built.is_versioned) {
        const vtx = VersionedTransaction.deserialize(txBytes);
        signed = await signTransaction(vtx);
      } else {
        const tx = Transaction.from(txBytes);
        // legacy tx carries its own blockhash already
        if (tx.recentBlockhash) blockhash = tx.recentBlockhash;
        if (tx.lastValidBlockHeight) lastValidBlockHeight = tx.lastValidBlockHeight;
        signed = await signTransaction(tx);
      }

      setGesture("confirming");

      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      setGesture("success");
      setLastSig(sig);
      fireSettlementConfetti(parseFloat(amount));
      const recipName = resolved.handle;
      toast.success(
        built.mode === "jupiter_swap"
          ? `Swapped ${amount} ${token.symbol} → USDC, sent to ${recipName}`
          : `Sent ${amount} ${token.symbol} to ${recipName}`,
        {
          action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(sig), "_blank") },
          description: `Reference: ${built.reference.slice(0, 4)}…${built.reference.slice(-4)}`,
        },
      );
      setAmount("");
      setNote("");
    } catch (e) {
      setGesture("error");
      toast.error(`Send failed: ${(e as Error).message}`);
    } finally {
      setTimeout(() => setGesture("idle"), 2000);
    }
  }

  // Format quote out_amount (always USDC, 6 decimals) for display
  const quotedUsdc = quote ? (Number(quote.out_amount) / 1_000_000).toFixed(2) : null;
  const priceImpactNum = quote ? parseFloat(quote.price_impact_pct) : null;
  const highImpact = priceImpactNum !== null && priceImpactNum > 1; // > 1%

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Send</h1>
            <p className="mt-2 text-sm text-foreground/60">
              Type @handle, amount, optional note. Phantom signs. Sub-second on Solana.
            </p>
          </div>
          <a
            href="/send/link"
            className="hidden shrink-0 rounded-full border border-foreground/20 px-4 py-2 text-xs hover:bg-foreground/5 sm:inline-flex"
          >
            Send via link →
          </a>
        </div>
      </div>

      {/* F19 — Screenshot tap-to-pay. Autofills To/Amount/Note from a Solana Pay QR. */}
      <div className="mb-4">
        <ScreenshotDropzone
          onParsed={(intent) => {
            setRecipient(intent.recipient);
            setResolved({
              handle: `${intent.recipient.slice(0, 4)}…${intent.recipient.slice(-4)}`,
              pubkey: intent.recipient,
            });
            if (intent.amount) setAmount(intent.amount);
            if (intent.message) setNote(intent.message);
            else if (intent.memo) setNote(intent.memo);
          }}
        />
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
      >
        <div>
          <label className="block text-xs font-medium text-foreground/60">To</label>
          <input
            value={recipient}
            onChange={(e) => {
              setRecipient(e.target.value);
              setResolved(null);
            }}
            onBlur={() => void handleResolve()}
            placeholder="@elena"
            className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
          />
          {resolved && (
            <div className="mt-2 text-xs text-accent">
              ✓ {resolved.handle} → {resolved.pubkey.slice(0, 4)}…{resolved.pubkey.slice(-4)}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="block text-xs font-medium text-foreground/60">
              Amount ({token.symbol})
            </label>
            <TokenPicker value={token} onChange={setToken} cluster={cluster} />
          </div>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={isUsdc ? "10.00" : "0.00"}
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
          />
          {!isUsdc && (
            <QuoteRow
              loading={quoteLoading}
              quote={quote}
              quotedUsdc={quotedUsdc}
              error={quoteError}
              mode={quoteMode}
              cluster={cluster}
              symbol={token.symbol}
              highImpact={highImpact}
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-foreground/60">Note (optional)</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="thanks for dinner"
            maxLength={200}
            className="mt-1 w-full rounded-lg border border-foreground/15 bg-transparent px-4 py-3 text-base outline-none focus:border-accent"
          />
        </div>

        <button
          type="submit"
          disabled={
            !connected ||
            gesture !== "idle" ||
            (!isUsdc && cluster === "devnet") ||
            (!isUsdc && cluster === "mainnet" && !quote && !quoteError)
          }
          className="w-full rounded-full bg-accent py-3 text-sm font-medium text-background disabled:opacity-50"
        >
          {!connected
            ? "Connect Phantom to send"
            : !isUsdc && cluster === "devnet"
              ? "Pick USDC — swap is mainnet only"
              : gesture === "signing"
                ? "Signing in Phantom…"
                : gesture === "confirming"
                  ? "Confirming on Solana…"
                  : gesture === "success"
                    ? "Sent ✓"
                    : isUsdc
                      ? `Send ${amount || "0"} USDC`
                      : quote
                        ? `Swap & send · ~$${quotedUsdc}`
                        : "Send"}
        </button>
      </form>

      {publicKey && (
        <div className="mt-8 rounded-lg border border-foreground/10 bg-foreground/5 p-4 text-xs text-foreground/50">
          From: <span className="font-mono">{publicKey.toBase58().slice(0, 8)}…</span>
        </div>
      )}

      {lastSig && (
        <div className="mt-3 text-center text-xs">
          <a
            href={getSolscanUrl(lastSig)}
            target="_blank"
            rel="noreferrer"
            className="text-accent hover:underline"
          >
            View last transfer on Solscan ↗
          </a>
        </div>
      )}

      <TrustGesture state={gesture} />
    </main>
  );
}

function QuoteRow({
  loading,
  quote,
  quotedUsdc,
  error,
  mode,
  cluster,
  symbol,
  highImpact,
}: {
  loading: boolean;
  quote: QuoteSummary | null;
  quotedUsdc: string | null;
  error: string | null;
  mode: Mode | null;
  cluster: "mainnet" | "devnet";
  symbol: string;
  highImpact: boolean;
}) {
  if (loading) {
    return (
      <div className="mt-2 text-[11px] text-foreground/50">Fetching live Jupiter quote…</div>
    );
  }
  if (error && !quote) {
    return (
      <div className="mt-2 text-[11px] text-red-500">
        Quote unavailable: {error}
      </div>
    );
  }
  if (!quote) {
    return (
      <div className="mt-2 text-[11px] text-foreground/50">
        Enter an amount to see a live quote.
      </div>
    );
  }
  return (
    <div
      className={`mt-2 space-y-1 rounded-lg border p-3 text-[11px] ${
        highImpact
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-foreground/10 bg-foreground/5"
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-foreground/60">You send</span>
        <span className="font-mono">{symbol}</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-foreground/60">Recipient gets</span>
        <span className="font-mono text-accent">${quotedUsdc} USDC</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-foreground/60">Price impact</span>
        <span className={highImpact ? "text-amber-500" : ""}>{quote.price_impact_pct}%</span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="text-foreground/60">Route</span>
        <span className="text-right text-foreground/70">{quote.route.join(" → ")}</span>
      </div>
      {mode === "mainnet_only" && cluster === "devnet" && (
        <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-amber-600">
          Devnet has no DEX liquidity. Quote is informational — swap+send activates on mainnet.
        </div>
      )}
      {highImpact && (
        <div className="mt-1 text-amber-600">High price impact — consider a smaller size.</div>
      )}
    </div>
  );
}
