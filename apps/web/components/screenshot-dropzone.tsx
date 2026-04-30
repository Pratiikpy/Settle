"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  blobFromClipboard,
  parseScreenshotToSolanaPay,
} from "../lib/screenshot-pay";

/**
 * F19 — Screenshot tap-to-pay drop-zone.
 *
 * Three input paths:
 *   1. Drag + drop an image onto the zone
 *   2. Click to pick a file
 *   3. Paste from clipboard while focused
 *
 * On successful parse, calls onParsed with the recipient pubkey + amount + label.
 * Errors surface as toasts. The host page decides what to do with the parsed values
 * (typically: prefill the To/Amount/Note fields).
 */

export interface ScreenshotPaymentIntent {
  recipient: string;
  /** Decimal amount string (e.g. "10.50") if the QR included one. */
  amount?: string;
  label?: string;
  message?: string;
  memo?: string;
  splToken?: string;
}

export function ScreenshotDropzone({
  onParsed,
}: {
  onParsed: (intent: ScreenshotPaymentIntent) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function handleBlob(blob: Blob) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await parseScreenshotToSolanaPay(blob);
      if (!r.ok) {
        toast.error(r.message);
        return;
      }
      const p = r.result.parsed;
      // parseURL returns either a TransferRequestURL or TransactionRequestURL.
      // We only auto-fill the form for transfer requests (transaction-requests need
      // wallet → fetch flow, which is a bigger rework — flag those as info-only).
      if ("link" in p) {
        toast.info(`Solana Pay transaction request: ${p.link}`);
        return;
      }
      const intent: ScreenshotPaymentIntent = {
        recipient: p.recipient.toBase58(),
        ...(p.amount ? { amount: p.amount.toString() } : {}),
        ...(p.label ? { label: p.label } : {}),
        ...(p.message ? { message: p.message } : {}),
        ...(p.memo ? { memo: p.memo } : {}),
        ...(p.splToken ? { splToken: p.splToken.toBase58() } : {}),
      };
      onParsed(intent);
      toast.success(
        intent.amount
          ? `Loaded $${intent.amount} → ${intent.recipient.slice(0, 6)}…`
          : `Loaded recipient ${intent.recipient.slice(0, 6)}…`,
      );
    } catch (e) {
      toast.error(`Decode failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  // Paste support — works when this dropzone (or the page) has focus.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const blob = blobFromClipboard(e);
      if (blob) {
        e.preventDefault();
        void handleBlob(blob);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={async (e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) await handleBlob(file);
      }}
      onClick={() => fileRef.current?.click()}
      className={`flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-3 text-xs transition ${
        dragging
          ? "border-accent bg-accent/10"
          : "border-foreground/20 bg-foreground/[0.02] hover:bg-foreground/[0.04]"
      }`}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.currentTarget.files?.[0];
          if (f) await handleBlob(f);
          if (e.currentTarget) e.currentTarget.value = "";
        }}
      />
      <div className="flex-1">
        <div className="font-medium text-foreground/80">
          {busy ? "Decoding…" : "Tap-to-pay from screenshot"}
        </div>
        <div className="mt-0.5 text-[11px] text-foreground/50">
          Drop a Solana Pay QR image, paste from clipboard, or click to pick a file.
        </div>
      </div>
      <span className="text-[10px] uppercase tracking-wider text-foreground/40">
        F19
      </span>
    </div>
  );
}
