"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Transaction, VersionedTransaction } from "@solana/web3.js";
import { toast } from "sonner";
import { TrustGesture } from "@settle/ui";
import { W6AppShell } from "../../components/w6-app-shell";
import { fireSettlementConfetti, trustGesture } from "../../lib/confetti";
import { parseHandleInput, displayHandle } from "@settle/sdk";
import { getSolscanUrl, NETWORK_NAME, getUsdcMint } from "../../lib/solana";
import { TokenPicker, type SelectedToken } from "../../components/token-picker";
import { ScreenshotDropzone } from "../../components/screenshot-dropzone";

/**
 * Wave 6 — Consumer Send.
 *
 * Layout matches `setltlt protype/settle/screen-c-send.jsx` 1:1:
 *   - Page header (kicker / title / subtitle)
 *   - Grid 2 (composer card + summary panel)
 *   - Composer: method-pills → recipient input → amount+token → For
 *     → extras grid → primary CTA → fee row
 *   - Summary panel: $X.XX display, breakdown rows, recent recipients
 *
 * Real backend preserved end-to-end: handleResolve / handleSend / live
 * Jupiter quote / mainnet-only swap gate / Phantom signing flow are
 * all unchanged. Methods are real where backend exists; "voice" is
 * gated behind the existing `/send/voice` route, "screenshot" reuses
 * the real ScreenshotDropzone, "qr" surfaces the dropzone too (a QR
 * screenshot is the same input).
 */

const cluster: "mainnet" | "devnet" =
  NETWORK_NAME === "mainnet" ? "mainnet" : "devnet";
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
type Method = "handle" | "pubkey" | "link" | "qr" | "screenshot" | "voice";
type Stage = "compose" | "signing" | "confirming" | "success";

const METHODS: Array<{ id: Method; label: string }> = [
  { id: "handle", label: "@handle" },
  { id: "pubkey", label: "Pubkey" },
  { id: "link", label: "Link" },
  { id: "qr", label: "QR" },
  { id: "screenshot", label: "Screenshot" },
];

interface RecentRecipient {
  handle: string | null;
  pubkey: string;
  last_at: string;
}

export default function SendPage() {
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const searchParams = useSearchParams();

  // Prefill from /send/voice → ?to=&amount=&note=
  const [method, setMethod] = useState<Method>("handle");
  const [recipient, setRecipient] = useState(
    () => searchParams?.get("to") ?? "",
  );
  const [amount, setAmount] = useState(
    () => searchParams?.get("amount") ?? "",
  );
  const [note, setNote] = useState(() => searchParams?.get("note") ?? "");
  const [token, setToken] = useState<SelectedToken>(DEFAULT_TOKEN);
  const [resolved, setResolved] = useState<{
    handle: string;
    pubkey: string;
  } | null>(null);
  const [extras, setExtras] = useState({
    split: false,
    schedule: false,
    public: false,
  });
  const [stage, setStage] = useState<Stage>("compose");
  const [lastSig, setLastSig] = useState<string | null>(null);
  const [recentRecipients, setRecentRecipients] = useState<RecentRecipient[]>(
    [],
  );

  // Quote state
  const [quote, setQuote] = useState<QuoteSummary | null>(null);
  const [quoteMode, setQuoteMode] = useState<Mode | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const isUsdc = token.mint === USDC_MINT;

  // Pull recent recipients from the unified ledger (real data — no
  // fakes). Falls back to empty list if the user has no history yet.
  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    fetch(
      `/api/ledger?wallet=${publicKey.toBase58()}&include_untrusted=false`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j) return;
        const me = publicKey.toBase58();
        const seen = new Map<string, RecentRecipient>();
        const rows: Array<{
          sender_pubkey: string | null;
          recipient_pubkey: string | null;
          occurred_at: string;
        }> = [
          ...(j.native_kernel ?? []),
          ...(j.native_imported ?? []),
        ];
        for (const r of rows) {
          const counterparty =
            r.sender_pubkey === me ? r.recipient_pubkey : r.sender_pubkey;
          if (!counterparty || counterparty === me) continue;
          if (!seen.has(counterparty)) {
            seen.set(counterparty, {
              handle: null,
              pubkey: counterparty,
              last_at: r.occurred_at,
            });
          }
        }
        setRecentRecipients(Array.from(seen.values()).slice(0, 4));
      })
      .catch(() => {
        /* recent recipients are decorative */
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey]);

  async function handleResolve() {
    if (!recipient.trim()) return;
    try {
      const parsed = parseHandleInput(recipient);
      const res = await fetch(
        `/api/resolve?handle=${encodeURIComponent(recipient)}`,
      );
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

  const inputAmountAtomic = useMemo(() => {
    const n = parseFloat(amount);
    if (!Number.isFinite(n) || n <= 0) return null;
    const scaled = Math.round(n * 10 ** token.decimals);
    if (scaled <= 0) return null;
    return BigInt(scaled).toString();
  }, [amount, token.decimals]);

  // Live quote for non-USDC inputs.
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
      toast.error("Connect a wallet to send.");
      return;
    }
    if (!isUsdc && cluster === "devnet") {
      toast.error(
        "Multi-token swap activates on mainnet. Pick USDC to send today.",
      );
      return;
    }

    trustGesture(parseFloat(amount));
    setStage("signing");
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
      if ("error" in built) throw new Error(built.message ?? built.error);
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
        if (tx.recentBlockhash) blockhash = tx.recentBlockhash;
        if (tx.lastValidBlockHeight)
          lastValidBlockHeight = tx.lastValidBlockHeight;
        signed = await signTransaction(tx);
      }

      setStage("confirming");

      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      setStage("success");
      setLastSig(sig);
      fireSettlementConfetti(parseFloat(amount));
      toast.success(
        built.mode === "jupiter_swap"
          ? `Swapped ${amount} ${token.symbol} → USDC, sent to ${resolved.handle}`
          : `Sent ${amount} ${token.symbol} to ${resolved.handle}`,
        {
          action: {
            label: "Solscan ↗",
            onClick: () => window.open(getSolscanUrl(sig), "_blank"),
          },
          description: `Reference: ${built.reference.slice(0, 4)}…${built.reference.slice(-4)}`,
        },
      );
    } catch (e) {
      setStage("compose");
      toast.error(`Send failed: ${(e as Error).message}`);
    }
  }

  function reset() {
    setStage("compose");
    setAmount("");
    setNote("");
    setLastSig(null);
  }

  const quotedUsdc = quote
    ? (Number(quote.out_amount) / 1_000_000).toFixed(2)
    : null;
  const priceImpactNum = quote ? parseFloat(quote.price_impact_pct) : null;
  const highImpact = priceImpactNum !== null && priceImpactNum > 1;
  // Bug #34: validate recipient is a real Solana pubkey before enabling Pay.
  // Without this the form happily accepted strings like "NOT_A_VALID_PUBKEY"
  // and only failed at API submission time (or worse, never reached it
  // because the button text already showed the bogus "to" string).
  const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  const recipientLooksValid = recipient.length > 0 && PUBKEY_RE.test(recipient);
  const amountValid = parseFloat(amount || "0") > 0;
  const ctaDisabled =
    !connected ||
    stage !== "compose" ||
    !recipientLooksValid ||
    !amountValid ||
    (!isUsdc && cluster === "devnet") ||
    (!isUsdc && cluster === "mainnet" && !quote && !quoteError);

  return (
    <W6AppShell>
      <div style={{ maxWidth: 1100 }}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Compose
          </div>
          <h1
            className="w6-heading"
            style={{
              fontSize: 36,
              margin: "8px 0 0",
              lineHeight: 1.05,
            }}
          >
            Send to anyone.
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
            @handle, wallet pubkey, payment link, QR code, or a screenshot.
            Every send produces a sealed receipt.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 360px",
            gap: 28,
            alignItems: "start",
          }}
          className="w6-send-grid"
        >
          {/* COMPOSER */}
          <div className="w6-card w6-send-form" style={{ padding: 28 }}>
            {/* Method picker */}
            <div className="w6-eyebrow" style={{ marginBottom: 10 }}>
              How are you sending?
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 22,
              }}
            >
              {METHODS.map((m) => {
                const on = method === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethod(m.id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      height: 32,
                      padding: "0 12px",
                      borderRadius: 999,
                      border: `1px solid ${on ? "var(--w6-ink)" : "var(--w6-rule)"}`,
                      background: on ? "var(--w6-ink)" : "#fff",
                      color: on ? "#fff" : "var(--w6-ink-2)",
                      fontSize: 12.5,
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            {/* Recipient input — varies by method */}
            <MethodInput
              method={method}
              recipient={recipient}
              setRecipient={setRecipient}
              setResolved={setResolved}
              handleResolve={handleResolve}
              onScreenshotParsed={(intent) => {
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

            {resolved && (
              <div
                style={{
                  marginTop: -6,
                  marginBottom: 18,
                  fontSize: 12,
                  color: "var(--w6-ok)",
                }}
              >
                ✓ {resolved.handle} → {resolved.pubkey.slice(0, 4)}…
                {resolved.pubkey.slice(-4)}
              </div>
            )}

            {/* Amount + token */}
            <label className="w6-eyebrow">Amount</label>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 8,
                marginBottom: 18,
              }}
            >
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={isUsdc ? "10.00" : "0.00"}
                inputMode="decimal"
                className="w6-input w6-input-lg"
                style={{ flex: 1 }}
                aria-label="Amount"
              />
              <div style={{ width: 130 }}>
                <TokenPicker value={token} onChange={setToken} cluster={cluster} />
              </div>
            </div>
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

            {/* Purpose */}
            <label className="w6-eyebrow">For</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="pizza, rent, …"
              maxLength={200}
              className="w6-input w6-input-lg"
              style={{ marginTop: 8, marginBottom: 18 }}
              aria-label="Purpose"
            />

            {/* Extras */}
            <div className="w6-hr" style={{ margin: "6px 0 18px" }} />
            <div className="w6-eyebrow" style={{ marginBottom: 10 }}>
              Extras
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
              }}
              className="w6-send-extras"
            >
              <ExtraToggle
                on={extras.split}
                onClick={() =>
                  setExtras((x) => ({ ...x, split: !x.split }))
                }
                label="Split this bill"
                desc="Across N people · ceiling-divided"
                href="/split-bill"
              />
              <ExtraToggle
                on={extras.schedule}
                onClick={() =>
                  setExtras((x) => ({ ...x, schedule: !x.schedule }))
                }
                label="Schedule"
                desc="Daily / weekly / monthly"
                href="/allowances"
              />
              <ExtraToggle
                on={extras.public}
                onClick={() =>
                  setExtras((x) => ({ ...x, public: !x.public }))
                }
                label="Public receipt"
                desc="Visible in feed (opt-in)"
              />
            </div>

            <div className="w6-hr" style={{ margin: "18px 0" }} />

            {/* CTA */}
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={ctaDisabled}
              className="w6-btn w6-btn-primary w6-btn-lg"
              style={{ width: "100%" }}
            >
              {!connected
                ? "Connect a wallet to send"
                : !isUsdc && cluster === "devnet"
                  ? "Pick USDC — swap is mainnet only"
                  : stage === "signing"
                    ? "Signing in wallet…"
                    : stage === "confirming"
                      ? "Confirming on Solana…"
                      : stage === "success"
                        ? "Sent ✓"
                        : `Pay ${amount || "0"} ${token.symbol} to ${recipient || "…"}`}
            </button>
            <div
              className="w6-muted"
              style={{
                fontSize: 11.5,
                textAlign: "center",
                marginTop: 10,
              }}
            >
              Solana fee ≈ 0.000005 SOL
              {amount && parseFloat(amount) > 0
                ? ` · receivable: ${amount} ${isUsdc ? "USDC" : `≈ $${quotedUsdc ?? "—"} USDC`}`
                : null}
            </div>
          </div>

          {/* SUMMARY (right) */}
          <div>
            {stage === "compose" && (
              <div className="w6-card" style={{ padding: 24 }}>
                <div className="w6-eyebrow" style={{ marginBottom: 16 }}>
                  Summary
                </div>
                <div
                  className="w6-heading"
                  style={{
                    fontSize: 48,
                    lineHeight: 0.95,
                    color: parseFloat(amount || "0") === 0 ? "var(--w6-ink-3)" : undefined,
                  }}
                >
                  {(() => {
                    const n = parseFloat(amount || "0");
                    // Empty-state framing: "Choose amount" reads as a hint,
                    // not as a $0 wallet balance. The label below shows the
                    // token + recipient placeholder so the panel still
                    // explains what's happening.
                    if (n === 0) return "Choose amount";
                    if (n < 0.01) return `$${n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")}`;
                    return `$${n.toFixed(2)}`;
                  })()}
                </div>
                <div
                  className="w6-muted"
                  style={{ fontSize: 14, marginTop: 4 }}
                >
                  {token.symbol} → {resolved?.handle || recipient || "…"}
                </div>
                <div className="w6-hr" style={{ margin: "20px 0" }} />
                <SummaryRow
                  k="For"
                  v={note || "—"}
                />
                <SummaryRow
                  k="Public"
                  v={extras.public ? "yes (opt-in)" : "private"}
                />
                <SummaryRow
                  k="Receipt kind"
                  v="direct_send"
                  mono
                />
                <SummaryRow k="Cluster" v={cluster} mono />

                {recentRecipients.length > 0 && (
                  <>
                    <div className="w6-hr" style={{ margin: "20px 0" }} />
                    <div
                      className="w6-eyebrow"
                      style={{ marginBottom: 10 }}
                    >
                      Recent recipients
                    </div>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                    >
                      {recentRecipients.map((r) => {
                        const display =
                          r.handle ??
                          `${r.pubkey.slice(0, 4)}…${r.pubkey.slice(-4)}`;
                        const active = recipient === display;
                        return (
                          <button
                            key={r.pubkey}
                            type="button"
                            onClick={() => {
                              setRecipient(display);
                              setResolved({
                                handle: display,
                                pubkey: r.pubkey,
                              });
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 10,
                              padding: 8,
                              borderRadius: 10,
                              background: active
                                ? "var(--w6-bg-3)"
                                : "transparent",
                              border: "1px solid transparent",
                              textAlign: "left",
                              cursor: "pointer",
                              width: "100%",
                            }}
                          >
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: "50%",
                                background: "var(--w6-ink)",
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 12,
                                fontWeight: 600,
                                flexShrink: 0,
                              }}
                            >
                              {display.replace(/[^A-Z0-9]/gi, "")[0]?.toUpperCase() ??
                                "?"}
                            </div>
                            <div
                              style={{ flex: 1, minWidth: 0 }}
                            >
                              <div
                                style={{
                                  fontSize: 12.5,
                                  fontWeight: 500,
                                }}
                              >
                                {display}
                              </div>
                              <div
                                className="w6-muted"
                                style={{ fontSize: 11 }}
                              >
                                last paid ·{" "}
                                {new Date(r.last_at).toLocaleDateString()}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {stage === "signing" && (
              <LifecycleCard
                step="sign"
                title="Approve in your wallet"
                body={`Pay ${amount} ${token.symbol} to ${resolved?.handle ?? recipient}`}
              />
            )}
            {stage === "confirming" && (
              <LifecycleCard
                step="confirm"
                title="Anchoring…"
                body="Waiting for slot confirmation."
              />
            )}
            {stage === "success" && (
              <div
                className="w6-card"
                style={{
                  padding: 24,
                  textAlign: "center",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: 80,
                    height: 80,
                    margin: "0 auto 14px",
                    borderRadius: "50%",
                    background: "var(--w6-ink)",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 32,
                  }}
                >
                  ✓
                </div>
                <div
                  className="w6-heading"
                  style={{ fontSize: 22, marginBottom: 4 }}
                >
                  Sent.
                </div>
                <div
                  className="w6-muted"
                  style={{ fontSize: 13, marginTop: 16 }}
                >
                  Receipt minted on-chain. Anyone can verify it without a
                  wallet.
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: 8,
                    marginTop: 18,
                  }}
                >
                  {lastSig && (
                    <a
                      href={getSolscanUrl(lastSig)}
                      target="_blank"
                      rel="noreferrer"
                      className="w6-btn w6-btn-secondary w6-btn-sm"
                    >
                      View on Solscan ↗
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={reset}
                    className="w6-btn w6-btn-primary w6-btn-sm"
                  >
                    Send another
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <TrustGesture
          state={
            stage === "signing"
              ? "signing"
              : stage === "confirming"
                ? "confirming"
                : stage === "success"
                  ? "success"
                  : "idle"
          }
        />

        <style>{`
          @media (max-width: 880px) {
            .w6-send-grid { grid-template-columns: 1fr !important; }
          }
          @media (max-width: 480px) {
            .w6-send-extras { grid-template-columns: 1fr !important; }
            .w6-send-form { padding-bottom: 96px !important; }
          }
        `}</style>
      </div>
    </W6AppShell>
  );
}

/* ============================================================ */

function MethodInput({
  method,
  recipient,
  setRecipient,
  setResolved,
  handleResolve,
  onScreenshotParsed,
}: {
  method: Method;
  recipient: string;
  setRecipient: (s: string) => void;
  setResolved: (
    r: { handle: string; pubkey: string } | null,
  ) => void;
  handleResolve: () => Promise<void>;
  onScreenshotParsed: (intent: {
    recipient: string;
    amount?: string;
    message?: string;
    memo?: string;
  }) => void;
}) {
  if (method === "handle") {
    return (
      <>
        <label className="w6-eyebrow">To</label>
        <input
          value={recipient}
          onChange={(e) => {
            setRecipient(e.target.value);
            setResolved(null);
          }}
          onBlur={() => void handleResolve()}
          placeholder="@handle"
          className="w6-input w6-input-lg"
          style={{ marginTop: 8, marginBottom: 18 }}
        />
      </>
    );
  }
  if (method === "pubkey") {
    return (
      <>
        <label className="w6-eyebrow">Pubkey</label>
        <input
          value={recipient}
          onChange={(e) => {
            setRecipient(e.target.value);
            setResolved(null);
          }}
          onBlur={() => void handleResolve()}
          placeholder="7xKXz9pQrT4nMm2vL8aBcDeFgHiJkLmNoPqRsTuVwXyZ"
          className="w6-input w6-input-lg w6-mono"
          style={{ marginTop: 8, marginBottom: 18, fontSize: 12 }}
        />
      </>
    );
  }
  if (method === "link") {
    return (
      <div
        className="w6-card-flat"
        style={{
          padding: 14,
          marginBottom: 18,
          background: "var(--w6-bg-2)",
        }}
      >
        <div className="w6-eyebrow" style={{ marginBottom: 6 }}>
          One-time payment link
        </div>
        <div className="w6-muted" style={{ fontSize: 11.5 }}>
          Open the link composer to mint a single-use Solana Pay link.
        </div>
        <Link
          href="/send/link"
          className="w6-btn w6-btn-secondary w6-btn-sm"
          style={{ marginTop: 10 }}
        >
          Open link composer →
        </Link>
      </div>
    );
  }
  if (method === "qr" || method === "screenshot") {
    return (
      <div
        className="w6-card-flat"
        style={{
          padding: 12,
          marginBottom: 18,
          background: "var(--w6-bg-2)",
        }}
      >
        <ScreenshotDropzone onParsed={onScreenshotParsed} />
      </div>
    );
  }
  if (method === "voice") {
    return (
      <div
        className="w6-card-flat"
        style={{
          padding: 22,
          marginBottom: 18,
          background: "var(--w6-bg-2)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 500 }}>Voice input</div>
        <div
          className="w6-muted"
          style={{ fontSize: 11.5, marginTop: 4, marginBottom: 10 }}
        >
          Hold-to-speak parsing exists at <code>/send/voice</code>.
        </div>
        <Link
          href="/send/voice"
          className="w6-btn w6-btn-secondary w6-btn-sm"
        >
          Open voice composer →
        </Link>
      </div>
    );
  }
  return null;
}

function ExtraToggle({
  on,
  onClick,
  label,
  desc,
  href,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  desc: string;
  href?: string;
}) {
  const inner = (
    <div style={{ display: "flex", gap: 8 }}>
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: "1px solid var(--w6-rule)",
          background: on ? "var(--w6-ink)" : "#fff",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 10,
          marginTop: 2,
        }}
      >
        {on ? "✓" : ""}
      </span>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</div>
        <div className="w6-muted" style={{ fontSize: 11.5 }}>
          {desc}
        </div>
      </div>
    </div>
  );
  const baseStyle = {
    padding: 10,
    textAlign: "left" as const,
    borderColor: on ? "var(--w6-ink)" : "var(--w6-rule)",
    background: on ? "var(--w6-bg-2)" : "#fff",
    width: "100%",
    cursor: "pointer",
    display: "block" as const,
    textDecoration: "none",
    color: "var(--w6-ink)",
  };
  // If an href is provided, the "extra" is really a shortcut to a
  // dedicated page (Split bill, Schedule). Single-click should navigate
  // immediately — toggling on first then requiring a second click is a
  // confusing dead-end (user reported: "Split this bill checkbox does
  // nothing visible after first click").
  if (href) {
    return (
      <Link href={href} className="w6-card-flat" style={baseStyle}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="w6-card-flat"
      style={baseStyle}
    >
      {inner}
    </button>
  );
}

function SummaryRow({
  k,
  v,
  mono,
}: {
  k: string;
  v: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 8,
        padding: "5px 0",
      }}
    >
      <span
        className="w6-micro"
        style={{ flex: 1, fontSize: 11.5 }}
      >
        {k}
      </span>
      <span
        className={mono ? "w6-mono" : ""}
        style={{ fontSize: mono ? 11.5 : 12.5 }}
      >
        {v}
      </span>
    </div>
  );
}

function LifecycleCard({
  step,
  title,
  body,
}: {
  step: "sign" | "confirm";
  title: string;
  body: string;
}) {
  return (
    <div className="w6-card" style={{ padding: 24 }}>
      <div className="w6-eyebrow" style={{ marginBottom: 12 }}>
        {step === "sign" ? "02 · Sign" : "03 · Confirm"}
      </div>
      <div
        className="w6-heading"
        style={{ fontSize: 22, marginBottom: 6 }}
      >
        {title}
      </div>
      <div
        className="w6-muted"
        style={{ fontSize: 13, marginBottom: 22 }}
      >
        {body}
      </div>
      <div
        style={{
          height: 4,
          background: "var(--w6-rule-2)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            background: "var(--w6-ink)",
            animation:
              step === "sign"
                ? "lc-pulse 0.7s linear infinite"
                : "lc-fill 0.42s linear forwards",
            width: step === "sign" ? "40%" : "100%",
          }}
        />
      </div>
      <style>{`
        @keyframes lc-pulse { 0% { transform: translateX(-50%);} 100% { transform: translateX(150%);} }
        @keyframes lc-fill  { from { width: 0%;} to { width: 100%;} }
      `}</style>
    </div>
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
      <div
        className="w6-muted"
        style={{ fontSize: 11.5, marginTop: -10, marginBottom: 18 }}
      >
        Fetching live Jupiter quote…
      </div>
    );
  }
  if (error && !quote) {
    return (
      <div
        style={{
          fontSize: 11.5,
          marginTop: -10,
          marginBottom: 18,
          color: "var(--w6-bad)",
        }}
      >
        Quote unavailable: {error}
      </div>
    );
  }
  if (!quote) {
    return (
      <div
        className="w6-muted"
        style={{ fontSize: 11.5, marginTop: -10, marginBottom: 18 }}
      >
        Enter an amount to see a live quote.
      </div>
    );
  }
  return (
    <div
      className="w6-card-flat"
      style={{
        padding: 12,
        marginTop: -10,
        marginBottom: 18,
        fontSize: 11.5,
        borderColor: highImpact
          ? "var(--w6-warn-cluster)"
          : "var(--w6-rule)",
        background: highImpact
          ? "rgba(245,158,11,0.06)"
          : "var(--w6-bg-2)",
      }}
    >
      <SummaryRow k="You send" v={symbol} mono />
      <SummaryRow k="Recipient gets" v={`$${quotedUsdc} USDC`} mono />
      <SummaryRow k="Price impact" v={`${quote.price_impact_pct}%`} />
      <SummaryRow k="Route" v={quote.route.join(" → ")} />
      {mode === "mainnet_only" && cluster === "devnet" && (
        <div
          style={{
            marginTop: 8,
            padding: "6px 8px",
            borderRadius: 6,
            background: "rgba(245,158,11,0.12)",
            color: "#92400e",
            fontSize: 11,
          }}
        >
          Devnet has no DEX liquidity. Quote is informational — swap+send
          activates on mainnet.
        </div>
      )}
    </div>
  );
}
