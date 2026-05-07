"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Transaction } from "@solana/web3.js";
import { toast } from "sonner";
import { CapabilityBadge, HashChainAnimation, ReceiptCard, TrustGesture, TrustScoreBadge } from "@settle/ui";
import { supabaseBrowser } from "../../../lib/supabase";
import { lamportsToUsdc } from "../../../lib/format";
import { getSolscanUrl } from "../../../lib/solana";
import { fireSettlementConfetti, trustGesture } from "../../../lib/confetti";
import { VoiceRecorder, encryptVoiceNote } from "../../../lib/voice-note";
import { asAuthHeaders, fetchAuthHeaders, withAuthQuery } from "../../../lib/client-auth";
import { EscrowState } from "../../../components/escrow-state";
import { ReceiptTimeline } from "../../../components/receipt-timeline";
import { ReceiptTags } from "../../../components/receipt-tags";
import { W6AppShell } from "../../../components/w6-app-shell";

interface ReceiptResponse {
  ok: true;
  receipt: {
    request_id: string;
    card_pubkey: string;
    pact_pubkey: string | null;
    merchant_pubkey: string;
    amount_lamports: string;
    decision: "ALLOW" | "DENY" | "REVIEW";
    deny_code: number | null;
    capability_hash: string | null;
    purpose_text_hash: string | null;
    purpose_hash: string | null;
    receipt_hash: string | null;
    reason_hash: string | null;
    policy_snapshot_hash: string | null;
    target_method: string;
    target_path: string;
    sig_solscan: string | null;
    decision_slot: number;
    policy_version: number;
    public_feed: boolean;
    created_at: string;
    request_initiated_at?: string | null;
    upstream_called_at?: string | null;
    upstream_returned_at?: string | null;
    submission_method?: "helius_sender_jito" | "rpc_fallback" | "wallet_send";
    compressed_sig?: string | null;
    compressed_addr?: string | null;
    /**
     * F2.0 Universal Receipt Kernel — kind discriminator. One of:
     *   x402_spend, direct_send, link_send, streaming_claim,
     *   escrow_release, escrow_dispute, refund.
     * Pre-migration-0019 rows backfill to 'x402_spend'.
     */
    receipt_kind?: string;
    /** BLAKE3({kind, sender, recipient, amount, request_id}). */
    context_hash?: string | null;
  };
  pact:
    | {
        pubkey: string;
        mode: "oneshot";
        cap_lamports: string;
        spent: string;
        closed: boolean;
        expiry_slot: string;
        authority_pubkey?: string;
      }
    | {
        pubkey: string;
        mode: "streaming";
        rate_lamports_per_slot: string;
        max_total_lamports: string;
        claimed: string;
        last_claim_slot: string;
        paused: boolean;
        closed: boolean;
        expiry_slot: string;
        authority_pubkey?: string;
      }
    | {
        pubkey: string;
        mode: "delivery_escrow";
        amount_lamports: string;
        merchant_pubkey: string;
        capability_hash: string | null;
        confirm_deadline_slot: string;
        dispute_deadline_slot: string;
        released: boolean;
        refunded: boolean;
        closed: boolean;
        expiry_slot: string;
        authority_pubkey?: string;
      }
    | null;
}

interface VerifyResponse {
  ok: boolean;
  partial: boolean;
  verified: string[];
  mismatches: string[];
  message?: string;
}

interface RefundBuildResponse {
  ok: boolean;
  mode: "pact_close" | "delivery_dispute" | "not_refundable";
  transaction?: string;
  blockhash?: string;
  last_valid_block_height?: number;
  message?: string;
  error?: string;
}

interface AttachmentRow {
  id: string;
  kind: "voice_note" | "text_note" | "image";
  duration_ms: number | null;
  mime_type: string | null;
  bytes: number | null;
  sealed_box_for_pubkey: string;
  created_by_pubkey: string;
  created_at: string;
}

/**
 * F2.8 Refund-by-emoji.
 *
 * Each emoji maps to an intent the API records alongside the on-chain refund.
 * The reason text is what the merchant sees + what the kernel commits as
 * `purpose_text` on the refund receipt; the emoji is metadata for analytics
 * + the user's own future ("what was that one I refunded with 😡 last week?").
 *
 * Order is intentional — disappointment first because it's the most common
 * "soft" case (close pact + reclaim unspent), anger last because it triggers
 * the dispute path on escrow pacts.
 */
const REFUND_EMOJIS: Array<{
  emoji: string;
  intent: string;
  hint: string;
  defaultReason: string;
}> = [
  {
    emoji: "😞",
    intent: "soft_refund",
    hint: "Just take my money back",
    defaultReason: "Asked for a refund — no specific complaint",
  },
  {
    emoji: "🤔",
    intent: "confused",
    hint: "I'm not sure what happened",
    defaultReason: "Unclear what was delivered — please clarify",
  },
  {
    emoji: "😡",
    intent: "dispute",
    hint: "This was wrong / scam",
    defaultReason: "Disputed: not delivered as described",
  },
];

// ~400ms per slot is the Solana mainnet target; devnet is similar enough for UX countdown.
// We re-tick once a second with a fresh getSlot() every 30s to absorb drift.
const APPROX_SLOT_MS = 400;

export default function ReceiptDetailPage() {
  const params = useParams<{ requestId: string }>();
  const search = useSearchParams();
  // ?view=raw collapses the forensic timeline (default = timeline on top).
  const showTimeline = search?.get("view") !== "raw";
  const { connected, publicKey, signTransaction, signMessage } = useWallet();
  const { connection } = useConnection();

  const [data, setData] = useState<ReceiptResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyResponse | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  // F2.8 — picked emoji + intent. The emoji is the user's "feeling" tag;
  // the actual on-chain ix is determined by the pact mode, not the emoji.
  const [refundEmoji, setRefundEmoji] = useState<string>("");
  const [refundIntent, setRefundIntent] = useState<string>("");
  const [refundCustom, setRefundCustom] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [gesture, setGesture] = useState<
    "idle" | "signing" | "confirming" | "success" | "error"
  >("idle");
  const [liveStatus, setLiveStatus] = useState<string | null>(null);

  // Refund-timer state — anchors a known slot to wall-clock and ticks
  const [currentSlot, setCurrentSlot] = useState<number | null>(null);
  const slotAnchorRef = useRef<{ slot: number; tMs: number } | null>(null);
  const [tickNow, setTickNow] = useState<number>(Date.now());

  // Voice note state
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const [recState, setRecState] = useState<"idle" | "recording" | "encrypting" | "uploading">(
    "idle",
  );
  const [recElapsedMs, setRecElapsedMs] = useState(0);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [playingId, setPlayingId] = useState<string | null>(null);

  // F2.3 Receipt-as-story narration. Loaded lazily from /api/receipts/[id]/narrate
  // which falls back to a deterministic template when no LLM key is configured,
  // so the UI always renders SOMETHING — never an empty block.
  const [narration, setNarration] = useState<{
    text: string;
    provider: string | null;
    cached: boolean;
  } | null>(null);
  const [narrationLoading, setNarrationLoading] = useState(false);

  // F4.2 polish — resolve merchant_pubkey → @handle if registered.
  // Falls back to the short pubkey form when no handle is bound.
  const [merchantHandle, setMerchantHandle] = useState<string | null>(null);

  // C111 — refund linkage. Bidirectional:
  //   refundOriginal: if THIS is a refund, the original receipt
  //   refunds:        if THIS receipt has refunds, the list
  interface LinkedReceipt {
    request_id: string;
    amount_lamports: string;
    receipt_kind: string | null;
    created_at: string;
    sig_solscan: string | null;
  }
  const [refundOriginal, setRefundOriginal] = useState<LinkedReceipt | null>(null);
  const [refunds, setRefunds] = useState<LinkedReceipt[]>([]);

  // Initial fetch + Realtime subscription on receipts row updates
  useEffect(() => {
    if (!params.requestId) return;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let attachChannel: RealtimeChannel | null = null;

    async function load() {
      try {
        const r = await fetch(`/api/receipts/${params.requestId}`);
        const json = (await r.json()) as ReceiptResponse | { error: string };
        if (cancelled) return;
        if ("ok" in json && json.ok) {
          setData(json);
          // Resolve merchant pubkey → @handle. Best-effort.
          void fetch(`/api/handles/by-pubkey?pubkey=${json.receipt.merchant_pubkey}`)
            .then(async (res) => {
              if (!res.ok) return;
              const j = (await res.json()) as { handle?: string };
              if (!cancelled && j.handle) setMerchantHandle(j.handle);
            })
            .catch(() => {});
          // C111 — load refund linkage. Best-effort: a missing endpoint
          // (pre-migration deploy) silently leaves refundOriginal/refunds null.
          void fetch(`/api/receipts/${json.receipt.request_id}/refund-links`)
            .then(async (res) => {
              if (!res.ok) return;
              const j = (await res.json()) as {
                original: LinkedReceipt | null;
                refunds: LinkedReceipt[];
              };
              if (cancelled) return;
              setRefundOriginal(j.original);
              setRefunds(j.refunds ?? []);
            })
            .catch(() => {});
        } else {
          setError(("error" in json && json.error) || "fetch_failed");
        }
      } catch (e) {
        if (!cancelled) setError(String((e as Error).message ?? e));
      }

      try {
        const supabase = supabaseBrowser();
        channel = supabase
          .channel(`receipt:${params.requestId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "receipts",
              filter: `request_id=eq.${params.requestId}`,
            },
            (payload) => {
              // Realtime delivers raw bytea columns as `\x...` hex strings — the
              // initial GET strips this server-side, but a naive spread here
              // re-pollutes capability_hash, *_hash, etc. on every UPDATE
              // (e.g., when compress-cron writes compressed_sig). Whitelist
              // only the fields that legitimately change post-insert.
              const liveFields: Array<keyof ReceiptResponse["receipt"]> = [
                "decision",
                "deny_code",
                "public_feed",
                "sig_solscan",
                "decision_slot",
                "compressed_sig",
                "compressed_addr",
              ];
              const safeUpdate: Partial<ReceiptResponse["receipt"]> = {};
              const incoming = payload.new as Record<string, unknown>;
              for (const k of liveFields) {
                if (k in incoming) {
                  Object.assign(safeUpdate, { [k]: incoming[k] });
                }
              }
              setData((prev) =>
                prev
                  ? {
                      ...prev,
                      receipt: { ...prev.receipt, ...safeUpdate },
                    }
                  : prev,
              );
              setLiveStatus("Receipt updated.");
            },
          )
          .subscribe();

        // Live INSERT on attachments — when sender adds a voice note, recipient sees it.
        attachChannel = supabase
          .channel(`attach:${params.requestId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "receipt_attachments",
              filter: `request_id=eq.${params.requestId}`,
            },
            (payload) => {
              const row = payload.new as AttachmentRow;
              setAttachments((prev) =>
                prev.some((a) => a.id === row.id) ? prev : [row, ...prev],
              );
              setLiveStatus(
                row.kind === "voice_note"
                  ? "🎙 New voice note attached."
                  : "Attachment added.",
              );
            },
          )
          .subscribe();
      } catch {
        // Supabase not configured — UI degrades gracefully
      }
    }
    void load();
    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
      if (attachChannel) void attachChannel.unsubscribe();
    };
  }, [params.requestId]);

  // Pact-row subscription
  useEffect(() => {
    if (!data?.pact?.pubkey) return;
    const pactPubkey = data.pact.pubkey;
    let channel: RealtimeChannel | null = null;
    try {
      const supabase = supabaseBrowser();
      channel = supabase
        .channel(`pact:${pactPubkey}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "pacts",
            filter: `pact_pubkey=eq.${pactPubkey}`,
          },
          (payload) => {
            const p = payload.new as Record<string, unknown>;
            const closed = Boolean(p.closed);
            setData((prev) => {
              if (!prev || !prev.pact) return prev;
              const expiry = String(p.expiry_slot ?? prev.pact.expiry_slot);
              if (prev.pact.mode === "streaming") {
                return {
                  ...prev,
                  pact: {
                    pubkey: prev.pact.pubkey,
                    mode: "streaming",
                    rate_lamports_per_slot: String(
                      p.rate_lamports_per_slot ?? prev.pact.rate_lamports_per_slot,
                    ),
                    max_total_lamports: String(
                      p.max_total_lamports ?? prev.pact.max_total_lamports,
                    ),
                    claimed: String(p.claimed ?? prev.pact.claimed),
                    last_claim_slot: String(p.last_claim_slot ?? prev.pact.last_claim_slot),
                    paused: Boolean(p.paused ?? prev.pact.paused),
                    closed,
                    expiry_slot: expiry,
                    ...(prev.pact.authority_pubkey
                      ? { authority_pubkey: prev.pact.authority_pubkey }
                      : {}),
                  },
                };
              }
              if (prev.pact.mode === "delivery_escrow") {
                return {
                  ...prev,
                  pact: {
                    pubkey: prev.pact.pubkey,
                    mode: "delivery_escrow",
                    amount_lamports: String(
                      p.escrow_amount ?? prev.pact.amount_lamports,
                    ),
                    merchant_pubkey: String(
                      p.escrow_merchant_pubkey ?? prev.pact.merchant_pubkey,
                    ),
                    capability_hash: prev.pact.capability_hash,
                    confirm_deadline_slot: String(
                      p.confirm_deadline_slot ?? prev.pact.confirm_deadline_slot,
                    ),
                    dispute_deadline_slot: String(
                      p.dispute_deadline_slot ?? prev.pact.dispute_deadline_slot,
                    ),
                    released: Boolean(p.released ?? prev.pact.released),
                    refunded: Boolean(p.refunded ?? prev.pact.refunded),
                    closed,
                    expiry_slot: expiry,
                    ...(prev.pact.authority_pubkey
                      ? { authority_pubkey: prev.pact.authority_pubkey }
                      : {}),
                  },
                };
              }
              return {
                ...prev,
                pact: {
                  pubkey: prev.pact.pubkey,
                  mode: "oneshot",
                  cap_lamports: String(p.cap_lamports ?? prev.pact.cap_lamports),
                  spent: String(p.spent ?? prev.pact.spent),
                  closed,
                  expiry_slot: expiry,
                  ...(prev.pact.authority_pubkey
                    ? { authority_pubkey: prev.pact.authority_pubkey }
                    : {}),
                },
              };
            });
            if (closed) setLiveStatus("Pact closed — refund settled on-chain.");
          },
        )
        .subscribe();
    } catch {
      // ignore
    }
    return () => {
      if (channel) void channel.unsubscribe();
    };
  }, [data?.pact?.pubkey]);

  // Auto-verify on load
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    void (async () => {
      setVerifying(true);
      try {
        const r = await fetch(`/api/receipts/${params.requestId}/verify`);
        const json = (await r.json()) as VerifyResponse;
        if (!cancelled) setVerify(json);
      } catch {
        // non-fatal
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, params.requestId]);

  // F2.3 — fetch narration in parallel with verify. Endpoint always returns
  // something (template fallback) so we never show a placeholder forever.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setNarrationLoading(true);
    void (async () => {
      try {
        const r = await fetch(`/api/receipts/${params.requestId}/narrate`);
        const j = (await r.json()) as {
          ok: boolean;
          narration?: string;
          provider?: string;
          cached?: boolean;
        };
        if (!cancelled && j.ok && j.narration) {
          setNarration({
            text: j.narration,
            provider: j.provider ?? null,
            cached: Boolean(j.cached),
          });
        }
      } catch {
        // non-fatal — receipt page renders without narration
      } finally {
        if (!cancelled) setNarrationLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, params.requestId]);

  // Refund timer — anchor slot to wall clock, refresh every 30s
  useEffect(() => {
    let cancelled = false;
    async function refreshSlot() {
      try {
        const slot = await connection.getSlot("confirmed");
        if (cancelled) return;
        slotAnchorRef.current = { slot, tMs: Date.now() };
        setCurrentSlot(slot);
      } catch {
        // ignore
      }
    }
    void refreshSlot();
    const id = window.setInterval(() => void refreshSlot(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [connection]);

  // Tick every second so the countdown reflects time-since-anchor
  useEffect(() => {
    const id = window.setInterval(() => setTickNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Estimate "now slot" between RPC fetches by adding (Date.now - anchor.tMs) / APPROX_SLOT_MS
  function estimatedNowSlot(): number | null {
    const anchor = slotAnchorRef.current;
    if (!anchor) return currentSlot;
    return anchor.slot + Math.floor((tickNow - anchor.tMs) / APPROX_SLOT_MS);
  }

  // Initial attachments fetch (auth-gated; only fires when wallet connected)
  useEffect(() => {
    if (!data || !connected || !publicKey || !signMessage) return;
    let cancelled = false;
    void (async () => {
      try {
        const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
        const url = withAuthQuery(`/api/receipts/${params.requestId}/attachments`, auth);
        const res = await fetch(url);
        if (!res.ok) return;
        const json = (await res.json()) as { attachments: AttachmentRow[] };
        if (!cancelled) setAttachments(json.attachments);
      } catch {
        // unauthenticated state is fine — attachments stay empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, connected, publicKey, signMessage, params.requestId]);

  // Recording elapsed-ms ticker
  useEffect(() => {
    if (recState !== "recording") return;
    const start = performance.now();
    const id = window.setInterval(() => {
      setRecElapsedMs(Math.round(performance.now() - start));
    }, 100);
    return () => window.clearInterval(id);
  }, [recState]);

  async function handleStartRecording() {
    if (!connected || !publicKey) {
      toast.error("Connect a wallet to attach a voice note.");
      return;
    }
    const recorder = new VoiceRecorder();
    const result = await recorder.start();
    if (!result.ok) {
      toast.error(`Microphone access failed: ${result.reason}`);
      return;
    }
    recorderRef.current = recorder;
    setRecElapsedMs(0);
    setRecState("recording");
    trustGesture();
  }

  async function handleStopRecording() {
    if (!recorderRef.current || !data || !publicKey || !signMessage) return;
    setRecState("encrypting");
    const stopped = await recorderRef.current.stop();
    recorderRef.current = null;
    if (!stopped) {
      setRecState("idle");
      return;
    }

    try {
      // Fetch sealed-box pubkey from server
      const cfg = await fetch("/api/sealed-box-pubkey");
      if (!cfg.ok) {
        const err = (await cfg.json()) as { error?: string };
        throw new Error(err.error ?? "sealed-box config missing");
      }
      const { pubkey_b64 } = (await cfg.json()) as { pubkey_b64: string };

      const cap = await encryptVoiceNote({
        blob: stopped.blob,
        durationMs: stopped.durationMs,
        mimeType: stopped.mimeType,
        sealedBoxPubkeyB64: pubkey_b64,
      });

      setRecState("uploading");

      // The "sealed_box_for" pubkey is the OTHER party — when sender attaches a voice note,
      // the recipient (= card.authority) is the one with rights to play it. For our purposes
      // we treat the merchant_pubkey as the recipient's pubkey if the caller is the merchant,
      // and card.authority's pubkey if the caller is the buyer/agent.
      // Simplification: caller attaches "for" the OTHER side. We assume the caller is the
      // sender (= card.authority for now); future extension lets merchant attach back.
      const recipientPubkey = data.receipt.merchant_pubkey;

      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);

      const ciphertextBuf = cap.ciphertext.buffer.slice(
        cap.ciphertext.byteOffset,
        cap.ciphertext.byteOffset + cap.ciphertext.byteLength,
      ) as ArrayBuffer;

      const fd = new FormData();
      fd.append(
        "ciphertext",
        new Blob([ciphertextBuf], { type: "application/octet-stream" }),
      );
      fd.append("kind", "voice_note");
      fd.append("duration_ms", String(cap.duration_ms));
      fd.append("mime_type", cap.mime_type);
      fd.append("sealed_box_for", recipientPubkey);

      const res = await fetch(`/api/receipts/${params.requestId}/attachments`, {
        method: "POST",
        headers: asAuthHeaders(auth),
        body: fd,
      });
      const json = (await res.json()) as
        | { ok: true; attachment: AttachmentRow }
        | { ok: false; error: string };
      if (!("ok" in json) || !json.ok) {
        throw new Error("error" in json ? json.error : "upload_failed");
      }

      toast.success("Voice note attached.");
      // The Realtime INSERT subscription will add it; manually push for immediate feedback
      setAttachments((prev) =>
        prev.some((a) => a.id === json.attachment.id)
          ? prev
          : [
              {
                id: json.attachment.id,
                kind: json.attachment.kind,
                duration_ms: json.attachment.duration_ms ?? null,
                mime_type: json.attachment.mime_type ?? null,
                bytes: json.attachment.bytes ?? null,
                sealed_box_for_pubkey: recipientPubkey,
                created_by_pubkey: publicKey.toBase58(),
                created_at: new Date().toISOString(),
              },
              ...prev,
            ],
      );
    } catch (e) {
      toast.error(`Attach failed: ${(e as Error).message}`);
    } finally {
      setRecState("idle");
    }
  }

  async function handlePlay(attachmentId: string) {
    if (!publicKey || !signMessage) {
      toast.error("Connect a wallet to play.");
      return;
    }
    setPlayingId(attachmentId);
    try {
      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      const url = withAuthQuery(
        `/api/receipts/${params.requestId}/attachments/${attachmentId}/play`,
        auth,
      );
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "play_failed");
      }
      const blob = await res.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.onended = () => setPlayingId(null);
      audio.onerror = () => setPlayingId(null);
      await audio.play();
    } catch (e) {
      toast.error(`Play failed: ${(e as Error).message}`);
      setPlayingId(null);
    }
  }

  async function handleRefund() {
    if (!connected || !publicKey || !signTransaction) {
      toast.error("Connect a wallet to refund.");
      return;
    }
    if (!refundEmoji) {
      toast.error("Pick an emoji.");
      return;
    }
    // The custom-text reason wins when provided; otherwise we use the
    // emoji's defaultReason. This keeps "tap and submit" a single click for
    // most users while letting power users add detail.
    const fallback = REFUND_EMOJIS.find((r) => r.emoji === refundEmoji)?.defaultReason ?? "";
    const reason = refundCustom.trim() || fallback;
    if (!reason) {
      toast.error("Add a short reason.");
      return;
    }

    trustGesture();
    setRefunding(true);
    setGesture("signing");
    try {
      if (!signMessage) {
        toast.error("Wallet does not support signing.");
        setGesture("error");
        return;
      }
      const auth = await fetchAuthHeaders(publicKey.toBase58(), signMessage);
      const buildRes = await fetch(`/api/receipts/${params.requestId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...asAuthHeaders(auth) },
        body: JSON.stringify({
          authority: publicKey.toBase58(),
          reason,
          emoji: refundEmoji,
          intent: refundIntent,
        }),
      });
      const built = (await buildRes.json()) as RefundBuildResponse;

      if (built.mode === "not_refundable") {
        toast.error(built.message ?? "Not refundable.");
        setGesture("error");
        return;
      }
      if (!built.ok || !built.transaction || !built.blockhash) {
        toast.error(built.error ?? "Refund tx build failed.");
        setGesture("error");
        return;
      }

      const tx = Transaction.from(Buffer.from(built.transaction, "base64"));
      const signed = await signTransaction(tx);
      setGesture("confirming");

      const sig = await connection.sendRawTransaction(signed.serialize(), {
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction(
        {
          signature: sig,
          blockhash: built.blockhash,
          lastValidBlockHeight: built.last_valid_block_height!,
        },
        "confirmed",
      );

      setGesture("success");
      fireSettlementConfetti();
      toast.success(
        built.mode === "delivery_dispute"
          ? "Disputed. Funds returning to your wallet."
          : "Pact closed. Unspent funds refunded.",
        {
          action: { label: "Solscan ↗", onClick: () => window.open(getSolscanUrl(sig), "_blank") },
        },
      );
      setRefundOpen(false);
    } catch (e) {
      setGesture("error");
      toast.error(`Refund failed: ${(e as Error).message}`);
    } finally {
      setRefunding(false);
      setTimeout(() => setGesture("idle"), 2400);
    }
  }

  if (error) {
    return (
      <W6AppShell>
        <div className="mx-auto max-w-2xl">
          <div className="w6-card" style={{ padding: 24, borderColor: "rgba(179, 38, 30, 0.32)", background: "var(--w6-bad-soft)" }}>
            Failed to load receipt: {error}
          </div>
        </div>
      </W6AppShell>
    );
  }
  if (!data) {
    return (
      <W6AppShell>
        <div className="mx-auto max-w-2xl">
          <div className="w6-skel" style={{ height: 128, borderRadius: 24 }} />
        </div>
      </W6AppShell>
    );
  }

  const r = data.receipt;
  const isAllow = r.decision === "ALLOW";
  const usdc = lamportsToUsdc(r.amount_lamports);

  // Refund timer math: pact has expiry_slot. Estimated now_slot from anchor + tick.
  // If pact closed → timer hidden. If now_slot >= expiry_slot → "expired."
  const nowSlot = estimatedNowSlot();
  let refundTimer: { secondsLeft: number; pct: number } | null = null;
  if (data.pact && !data.pact.closed && nowSlot !== null) {
    const expiry = Number(data.pact.expiry_slot);
    const slotsLeft = Math.max(0, expiry - nowSlot);
    const secondsLeft = Math.max(0, Math.round((slotsLeft * APPROX_SLOT_MS) / 1000));
    // Estimate the original window from data.created_at to expiry (rough but workable for UX)
    const createdAt = new Date(r.created_at).getTime();
    const fullSeconds = Math.max(1, Math.round((expiry - r.decision_slot) * APPROX_SLOT_MS / 1000));
    void createdAt;
    const pct = Math.max(0, Math.min(1, secondsLeft / fullSeconds));
    refundTimer = { secondsLeft, pct };
  }

  return (
    <W6AppShell>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: 1, minWidth: 280 }}>
              <div className="w6-eyebrow" style={{ fontSize: 12 }}>
                Receipt
              </div>
              <h1
                className="w6-heading"
                style={{ fontSize: 28, margin: "8px 0 0", lineHeight: 1.1 }}
              >
                <code className="w6-mono" style={{ fontSize: 22 }}>
                  R-{r.request_id.slice(0, 8).toUpperCase()}
                </code>
              </h1>
              <p
                className="w6-muted"
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  lineHeight: 1.5,
                  maxWidth: 600,
                }}
              >
                Forensic timeline below: 4-hash kernel commit, narration,
                refund linkage if any, and on-chain anchor.
              </p>
            </div>
            <TrustScoreBadge pubkey={r.merchant_pubkey} variant="full" />
          </div>
        </div>

        <ReceiptCard
          merchant={
            merchantHandle
              ? `@${merchantHandle}`
              : `${r.merchant_pubkey.slice(0, 6)}…${r.merchant_pubkey.slice(-4)}`
          }
          amountUsdc={`$${usdc}`}
          note={`${r.target_method} ${r.target_path}`}
          decision={r.decision}
          {...(r.deny_code !== null ? { denyCode: r.deny_code } : {})}
          {...(r.sig_solscan ? { solscanHref: getSolscanUrl(r.sig_solscan) } : {})}
          verified={Boolean(verify?.ok)}
          onVerify={() => {
            void (async () => {
              setVerifying(true);
              try {
                const res = await fetch(`/api/receipts/${params.requestId}/verify`);
                const json = (await res.json()) as VerifyResponse;
                setVerify(json);
                if (json.ok) {
                  toast.success(json.partial ? "Partially verified ✓" : "All 4 hashes match ✓");
                } else {
                  toast.error(`Mismatch: ${json.mismatches.join(", ")}`);
                }
              } finally {
                setVerifying(false);
              }
            })();
          }}
        />

        {/* F2.3 Receipt-as-story narration. Always renders something — the
            endpoint falls back to a deterministic template when no LLM key
            is configured. We show a thin loading state on first view so
            cache-cold pages don't flash empty. */}
        <section className="mt-6 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5">
          {narrationLoading && !narration ? (
            <p className="text-xs text-[#71717a]">Generating narration…</p>
          ) : narration ? (
            <>
              <p className="text-sm leading-relaxed text-[#27272a]">
                {narration.text}
              </p>
              {narration.provider && (
                <p className="mt-3 text-[10px] uppercase tracking-wide text-[#a1a1aa]">
                  {narration.provider === "template"
                    ? "deterministic narrator"
                    : narration.provider === "nvidia_nim"
                      ? "narrated by minimax-m2.5"
                      : narration.provider === "anthropic"
                        ? "narrated by claude"
                        : narration.provider}
                  {narration.cached ? " · cached" : " · just generated"}
                </p>
              )}
            </>
          ) : null}
        </section>

        {/* C111 — Refund linkage. Bidirectional surfaces:
            - "This is a refund of …" link when refundOriginal is set
            - "Refunds against this receipt" list when refunds[] non-empty */}
        {(refundOriginal || refunds.length > 0) && (
          <section className="mt-6 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5">
            {refundOriginal && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[#71717a]">
                  This is a refund of
                </p>
                <Link
                  href={`/receipts/${refundOriginal.request_id}`}
                  className="mt-2 block rounded-lg border border-[#e4e4e7] bg-[#fafafa] p-3 text-xs hover:border-[#a1a1aa]"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <strong className="text-[#27272a]">
                      ${(Number(refundOriginal.amount_lamports) / 1e6).toFixed(2)} USDC
                    </strong>
                    <span className="text-[10px] uppercase tracking-wide text-[#71717a]">
                      {refundOriginal.receipt_kind ?? "x402_spend"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[#52525b]">
                    {new Date(refundOriginal.created_at).toLocaleString()} ·{" "}
                    <code className="font-mono">
                      {refundOriginal.request_id.slice(0, 8)}…
                    </code>
                  </p>
                </Link>
              </div>
            )}

            {refunds.length > 0 && (
              <div className={refundOriginal ? "mt-4" : ""}>
                <p className="text-[11px] uppercase tracking-wide text-[#71717a]">
                  Refunds against this receipt
                </p>
                <ul className="mt-2 space-y-2">
                  {refunds.map((rf) => (
                    <li key={rf.request_id}>
                      <Link
                        href={`/receipts/${rf.request_id}`}
                        className="block rounded-lg border border-[#e4e4e7] bg-[#fafafa] p-3 text-xs hover:border-[#a1a1aa]"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <strong className="text-[#27272a]">
                            -${(Number(rf.amount_lamports) / 1e6).toFixed(2)} USDC
                          </strong>
                          <span className="text-[10px] uppercase tracking-wide text-emerald-400">
                            refund
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#52525b]">
                          {new Date(rf.created_at).toLocaleString()} ·{" "}
                          <code className="font-mono">
                            {rf.request_id.slice(0, 8)}…
                          </code>
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Forensic timeline — story shape over the same data. ?view=raw hides this. */}
        {showTimeline && <ReceiptTimeline r={r} />}

        {/* C113 — PDF export. Opens the print-styled page; user prints to
            PDF via the browser. Lowest-tech, works in any browser, no
            headless Chromium dependency. */}
        <div className="mt-6 flex gap-2 text-xs">
          <a
            href={`/receipts/${params.requestId}/print`}
            target="_blank"
            rel="noreferrer"
            className="rounded-full border border-[#a1a1aa] px-3 py-1.5 text-[#52525b] hover:bg-[#f4f4f5]"
          >
            Save as PDF →
          </a>
        </div>

        {/* Live status surface */}
        {liveStatus && (
          <div className="mt-4 rounded-xl border border-accent/30 bg-accent/10 p-3 text-xs text-accent">
            ● Live · {liveStatus}
          </div>
        )}

        {/* Refund timer — codex round-2: shared time-state visible to both sides */}
        {refundTimer && (
          <section className="mt-6 rounded-2xl border border-[#e4e4e7] bg-gradient-to-br from-amber-500/10 to-transparent p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Refund window</h2>
              <span className="font-mono text-xs text-[#52525b]">
                {humanizeDuration(refundTimer.secondsLeft)} left
              </span>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#e4e4e7]">
              <div
                className="h-full rounded-full bg-amber-400 transition-all duration-1000 ease-linear"
                style={{ width: `${(refundTimer.pct * 100).toFixed(2)}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[#71717a]">
              While the pact stays open, the buyer can refund unspent funds via the 😞 button.
              Both sides see the same timer.
            </p>
          </section>
        )}

        {/* F2.7 Hash-chain animation — plays once per receipt-id per session.
            Sits above the verification block so the visual narrative is:
            "look, here's the chain → and here's the math that proves it." */}
        <section className="mt-6">
          <HashChainAnimation receiptId={r.request_id} />
        </section>

        {/* F2.11 Receipt tags — private to the connected wallet. */}
        <section className="mt-6">
          <ReceiptTags requestId={r.request_id} />
        </section>

        {/* Verification status */}
        <section className="mt-6 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-medium">Cryptographic verification</h2>
            {/* F2.0 Universal Receipt Kernel — kind badge tells the user which
                payment shape produced this receipt. The 4-hash commit chain is
                the same for every kind; the kind affects which canonical
                objects were used to build it. */}
            {r.receipt_kind && (
              <span
                className="rounded-full border border-[#e4e4e7] bg-[#fafafa] px-2 py-0.5 font-mono text-[10px] tracking-wide text-[#27272a]"
                title="Universal Receipt Kernel — payment kind discriminator"
              >
                kind: {r.receipt_kind}
              </span>
            )}
          </div>
          {verifying ? (
            <p className="mt-3 text-xs text-[#52525b]">Recomputing 4-hash chain…</p>
          ) : verify ? (
            <div className="mt-3 grid gap-2 text-xs">
              <p className="text-[#27272a]">{verify.message}</p>
              <div className="grid grid-cols-2 gap-1 text-[11px]">
                {["receipt_hash", "reason_hash", "policy_snapshot_hash", "purpose_hash"].map((h) => {
                  const ok = verify.verified.includes(h);
                  return (
                    <div
                      key={h}
                      className={
                        ok
                          ? "text-emerald-300"
                          : verify.mismatches.includes(h)
                            ? "text-red-300"
                            : "text-[#71717a]"
                      }
                    >
                      {ok ? "✓" : verify.mismatches.includes(h) ? "✗" : "○"} {h}
                    </div>
                  );
                })}
              </div>
              {r.context_hash && (
                <p className="mt-2 break-all font-mono text-[10px] text-[#71717a]">
                  <span className="text-[#52525b]">context_hash:</span> {r.context_hash}
                </p>
              )}
            </div>
          ) : null}
        </section>

        {/* Voice note section — F5 signature UX */}
        {isAllow && (
          <section className="mt-6 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Voice notes</h2>
              <span className="text-[11px] text-[#71717a]">Sealed-box encrypted</span>
            </div>

            {/* Recorder */}
            <div className="mt-3">
              {recState === "idle" && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleStartRecording()}
                    disabled={!connected}
                    aria-label="Record voice note"
                    className="grid h-12 w-12 place-items-center rounded-full border border-red-400/40 text-2xl text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                  >
                    🎙
                  </button>
                  <span className="text-xs text-[#52525b]">
                    {connected
                      ? "Tap to record up to 10s. Encrypted before upload."
                      : "Connect a wallet to record."}
                  </span>
                </div>
              )}
              {recState === "recording" && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void handleStopRecording()}
                    aria-label="Stop recording"
                    className="grid h-12 w-12 place-items-center rounded-full bg-red-500 text-2xl text-white animate-pulse"
                  >
                    ◼
                  </button>
                  <span className="font-mono text-xs text-red-300">
                    Recording… {(recElapsedMs / 1000).toFixed(1)}s
                  </span>
                </div>
              )}
              {(recState === "encrypting" || recState === "uploading") && (
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-full border border-[#e4e4e7] text-[#52525b]">
                    …
                  </span>
                  <span className="text-xs text-[#52525b]">
                    {recState === "encrypting" ? "Encrypting…" : "Uploading…"}
                  </span>
                </div>
              )}
            </div>

            {/* Player list */}
            {attachments.filter((a) => a.kind === "voice_note").length > 0 && (
              <div className="mt-5 grid gap-2">
                {attachments
                  .filter((a) => a.kind === "voice_note")
                  .map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 rounded-xl border border-[#e4e4e7] p-3"
                    >
                      <button
                        type="button"
                        onClick={() => void handlePlay(a.id)}
                        disabled={playingId === a.id}
                        aria-label="Play voice note"
                        className="grid h-9 w-9 place-items-center rounded-full bg-accent text-background"
                      >
                        {playingId === a.id ? "♪" : "▶"}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs text-[#27272a]">
                          {a.duration_ms ? `${(a.duration_ms / 1000).toFixed(1)}s` : "voice note"}
                          {" · "}
                          <span className="font-mono">
                            {a.created_by_pubkey.slice(0, 6)}…{a.created_by_pubkey.slice(-4)}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#71717a]">
                          {new Date(a.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {!connected && (
              <p className="mt-3 text-[11px] text-[#71717a]">
                Decryption is wallet-sig gated. Connect to play.
              </p>
            )}
          </section>
        )}

        {/* Pact state if pact-scoped */}
        {data.pact && (
          <section className="mt-6 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5">
            <h2 className="text-sm font-medium">
              Pact state{" "}
              <span className="ml-2 rounded bg-[#e4e4e7] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[#52525b]">
                {data.pact.mode}
              </span>
            </h2>
            {data.pact.mode === "streaming" ? (
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[#27272a]">
                <div>
                  <div className="text-[#71717a]">Max budget</div>
                  <div>${lamportsToUsdc(data.pact.max_total_lamports)}</div>
                </div>
                <div>
                  <div className="text-[#71717a]">Claimed</div>
                  <div>${lamportsToUsdc(data.pact.claimed)}</div>
                </div>
                <div>
                  <div className="text-[#71717a]">Rate</div>
                  <div className="font-mono">{data.pact.rate_lamports_per_slot} / slot</div>
                </div>
                <div>
                  <div className="text-[#71717a]">Status</div>
                  <div
                    className={
                      data.pact.closed
                        ? "text-red-300"
                        : data.pact.paused
                          ? "text-amber-300"
                          : "text-emerald-300"
                    }
                  >
                    {data.pact.closed ? "Closed" : data.pact.paused ? "Paused" : "Streaming"}
                  </div>
                </div>
                <div>
                  <div className="text-[#71717a]">Last claim slot</div>
                  <div className="font-mono">{data.pact.last_claim_slot}</div>
                </div>
                <div>
                  <div className="text-[#71717a]">Expires at slot</div>
                  <div className="font-mono">{data.pact.expiry_slot}</div>
                </div>
              </div>
            ) : data.pact.mode === "delivery_escrow" ? (
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[#27272a]">
                <div>
                  <div className="text-[#71717a]">Held in escrow</div>
                  <div>${lamportsToUsdc(data.pact.amount_lamports)}</div>
                </div>
                <div>
                  <div className="text-[#71717a]">Pinned merchant</div>
                  <div className="font-mono">
                    {data.pact.merchant_pubkey.slice(0, 6)}…{data.pact.merchant_pubkey.slice(-4)}
                  </div>
                </div>
                <div>
                  <div className="text-[#71717a]">Confirm by slot</div>
                  <div className="font-mono">{data.pact.confirm_deadline_slot}</div>
                </div>
                <div>
                  <div className="text-[#71717a]">Dispute by slot</div>
                  <div className="font-mono">{data.pact.dispute_deadline_slot}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[#71717a]">Status</div>
                  <div
                    className={
                      data.pact.released
                        ? "text-emerald-300"
                        : data.pact.refunded
                          ? "text-amber-300"
                          : "text-[#27272a]"
                    }
                  >
                    {data.pact.released
                      ? "Released to merchant"
                      : data.pact.refunded
                        ? "Refunded to buyer"
                        : "Held — awaiting confirm or dispute"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-[#27272a]">
                <div>
                  <div className="text-[#71717a]">Cap</div>
                  <div>${lamportsToUsdc(data.pact.cap_lamports)}</div>
                </div>
                <div>
                  <div className="text-[#71717a]">Spent</div>
                  <div>${lamportsToUsdc(data.pact.spent)}</div>
                </div>
                <div>
                  <div className="text-[#71717a]">Status</div>
                  <div className={data.pact.closed ? "text-red-300" : "text-emerald-300"}>
                    {data.pact.closed ? "Closed" : "Open"}
                  </div>
                </div>
                <div>
                  <div className="text-[#71717a]">Expires at slot</div>
                  <div className="font-mono">{data.pact.expiry_slot}</div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* F22 — interactive escrow controls (release / dispute / permissionless release) */}
        {data.pact?.mode === "delivery_escrow" && data.pact.authority_pubkey && (
          <section className="mt-6">
            <EscrowState
              pactPubkey={data.pact.pubkey}
              amountLamports={data.pact.amount_lamports}
              merchantPubkey={data.pact.merchant_pubkey}
              buyerPubkey={data.pact.authority_pubkey}
              confirmDeadlineSlot={data.pact.confirm_deadline_slot}
              disputeDeadlineSlot={data.pact.dispute_deadline_slot}
              released={data.pact.released}
              refunded={data.pact.refunded}
            />
          </section>
        )}

        {/* F2.8 Refund-by-emoji surface.
            Three emoji buttons: 😞 soft, 🤔 confused, 😡 dispute. Each
            pre-fills a default reason; users can override with custom text.
            The on-chain ix that runs depends on the pact mode (close_pact
            for OneShot/Streaming; dispute_delivery_escrow for escrow), not
            the emoji. The emoji is metadata for analytics + the user's own
            "what was that one I refunded with 😡" memory. */}
        {isAllow && (
          <section className="mt-6 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5">
            <h2 className="text-sm font-medium">Refund</h2>
            {!refundOpen ? (
              <div className="mt-3 flex items-center gap-3">
                <div className="flex gap-2">
                  {REFUND_EMOJIS.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      onClick={() => {
                        setRefundEmoji(r.emoji);
                        setRefundIntent(r.intent);
                        setRefundOpen(true);
                      }}
                      className="grid h-12 w-12 place-items-center rounded-full border border-[#e4e4e7] text-2xl transition hover:bg-[#f4f4f5]"
                      aria-label={`Refund: ${r.intent}`}
                      title={r.hint}
                    >
                      {r.emoji}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-[#52525b]">
                  Tap how you feel. Settle handles the rest.
                </span>
              </div>
            ) : (
              <div className="mt-3 grid gap-3">
                <div className="flex flex-wrap gap-2">
                  {REFUND_EMOJIS.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      onClick={() => {
                        setRefundEmoji(r.emoji);
                        setRefundIntent(r.intent);
                      }}
                      className={
                        refundEmoji === r.emoji
                          ? "flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-xs text-background"
                          : "flex items-center gap-2 rounded-full border border-[#e4e4e7] px-3 py-1.5 text-xs text-[#27272a] hover:bg-[#f4f4f5]"
                      }
                      title={r.hint}
                    >
                      <span className="text-base">{r.emoji}</span>
                      <span>{r.intent.replace(/_/g, " ")}</span>
                    </button>
                  ))}
                </div>
                <input
                  value={refundCustom}
                  onChange={(e) => setRefundCustom(e.target.value)}
                  maxLength={200}
                  placeholder={
                    refundEmoji
                      ? `Optional — defaults to "${
                          REFUND_EMOJIS.find((r) => r.emoji === refundEmoji)?.defaultReason
                        }"`
                      : "Pick an emoji first"
                  }
                  className="rounded-lg border border-[#e4e4e7] bg-transparent px-3 py-2 text-xs outline-none focus:border-accent"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRefund()}
                    disabled={refunding || !refundEmoji || !connected}
                    className="rounded-full bg-accent px-4 py-2 text-xs font-medium text-background disabled:opacity-50"
                  >
                    {refunding ? "Refunding…" : `Refund ${refundEmoji}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRefundOpen(false);
                      setRefundEmoji("");
                      setRefundIntent("");
                      setRefundCustom("");
                    }}
                    className="rounded-full border border-[#e4e4e7] px-4 py-2 text-xs hover:bg-[#f4f4f5]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {/* Show the latest emoji on already-refunded receipts so the
                user remembers their intent without scrolling refund_requests. */}
            {data.receipt && (data.receipt as unknown as { refund_emoji?: string }).refund_emoji && (
              <p className="mt-3 text-[11px] text-[#52525b]">
                Last refund:{" "}
                <span className="text-base">
                  {(data.receipt as unknown as { refund_emoji: string }).refund_emoji}
                </span>
              </p>
            )}
          </section>
        )}

        {/* Hash + slot details */}
        <section className="mt-6 rounded-2xl border border-[#e4e4e7] bg-white/[0.02] p-5">
          <h2 className="text-sm font-medium">Hashes</h2>
          {/* F2.7 hash-chain animation already mounted in the section
              above (line ~1024). No duplicate here. */}
          {/* F3.4 — capability badge: surface the human alias if registered. */}
          {r.capability_hash && /^[0-9a-f]{64}$/i.test(r.capability_hash) && (
            <div className="mt-2">
              <CapabilityBadge hash={r.capability_hash} />
            </div>
          )}
          <div className="mt-3 grid gap-2 text-[11px] font-mono text-[#52525b]">
            <Line label="receipt_hash" value={r.receipt_hash} />
            <Line label="reason_hash" value={r.reason_hash} />
            <Line label="policy_snapshot_hash" value={r.policy_snapshot_hash} />
            <Line label="purpose_hash" value={r.purpose_hash} />
            <Line label="purpose_text_hash" value={r.purpose_text_hash} />
            <Line label="capability_hash" value={r.capability_hash} />
          </div>
          <div className="mt-3 text-[11px] text-[#71717a]">
            Slot {r.decision_slot} · policy v{r.policy_version} · {new Date(r.created_at).toLocaleString()}
          </div>
          {r.submission_method && (
            <div
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[#e4e4e7] bg-[#fafafa] px-2.5 py-1 text-[10px]"
              title={
                r.submission_method === "helius_sender_jito"
                  ? "Posted as Jito bundle via Helius Sender for confirmed-on-first-try landing. Compute-budget priority fee + Jito tip baked into the tx."
                  : r.submission_method === "rpc_fallback"
                    ? "Posted via vanilla RPC sendRawTransaction (HELIUS_API_KEY unset; Jito-bundle path skipped)."
                    : "Submitted directly by the user's wallet via sendRawTransaction."
              }
            >
              {r.submission_method === "helius_sender_jito" ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="font-medium text-emerald-400">Helius Sender · Jito bundle</span>
                </>
              ) : r.submission_method === "rpc_fallback" ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  <span className="text-[#52525b]">RPC sendRawTransaction (Sender unavailable)</span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                  <span className="text-[#52525b]">Wallet sendRawTransaction</span>
                </>
              )}
            </div>
          )}

          {/* ZK Compression mirror — populated async by compress-cron. The
              on-chain 4-hash commit on sig_solscan above is the canonical
              proof; this is a Light Protocol-indexed secondary record at
              ~$0.001/account, queryable via Photon RPC. */}
          {r.compressed_sig && (
            <div className="mt-3 rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                  <span className="text-xs font-medium text-violet-200">
                    ZK Compressed receipt
                  </span>
                </div>
                <span className="text-[10px] text-[#71717a]">
                  Light Protocol · ~$0.001
                </span>
              </div>
              <p className="mt-2 text-[11px] text-[#52525b]">
                Mirrored as a 1-unit compressed token to the buyer&rsquo;s wallet.
                Indexed by Photon RPC and visible in Light-Protocol-aware
                explorers.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-1.5 text-[11px]">
                <div className="grid grid-cols-[88px,1fr] gap-2">
                  <span className="text-[#71717a]">mint</span>
                  <code className="truncate font-mono text-[#27272a]">
                    {r.compressed_addr ?? "—"}
                  </code>
                </div>
                <div className="grid grid-cols-[88px,1fr] gap-2">
                  <span className="text-[#71717a]">tx</span>
                  <a
                    href={getSolscanUrl(r.compressed_sig)}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate font-mono text-violet-300 hover:text-violet-200"
                  >
                    {r.compressed_sig.slice(0, 24)}…{r.compressed_sig.slice(-8)} ↗
                  </a>
                </div>
              </div>
            </div>
          )}
        </section>

        <p className="mt-8 text-center text-[11px] text-[#71717a]">
          <Link href={`/cards/${r.card_pubkey}`} className="hover:text-accent">
            ← Card timeline
          </Link>
        </p>

        <TrustGesture state={gesture} />
      </div>
    </W6AppShell>
  );
}

function Line({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[180px,1fr] gap-3">
      <span className="text-[#71717a]">{label}</span>
      <code className="break-all">{value ?? "—"}</code>
    </div>
  );
}

function humanizeDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const hrs = hours % 24;
  return `${days}d ${hrs}h`;
}
