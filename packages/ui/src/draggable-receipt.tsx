"use client";

import { useState, type ReactNode } from "react";

/**
 * F2.9 — Receipt drag-to-share.
 *
 * Wraps a receipt card with HTML5 drag-and-drop support. Dragging the
 * card sets the dataTransfer payload to:
 *   - text/plain      → the public verify URL
 *   - text/uri-list   → same URL (system file managers + browsers honor this)
 *   - application/json → { request_id, receipt_hash, kind, amount_lamports }
 *
 * Drag targets that handle text/uri-list (browsers, Notes apps, Slack,
 * Discord, etc.) get a clickable proof link. Drag targets that handle
 * text/plain (most chat apps) get a plain URL. Drag targets that
 * understand JSON (other Settle-aware UIs) get the full object.
 *
 * The drop targets we register inside the app:
 *   - "tag" zone: drop here to apply a tag
 *   - "archive" zone: drop here to archive
 *   - "compare" zone: drop two receipts here to side-by-side compare
 *
 * Mobile: the `:active` press-and-hold visual hint mimics native iOS
 * drag UX. Real touch-drag is browser-dependent so we don't promise it
 * everywhere — the "share" button stays the canonical mobile path.
 */
export interface DraggableReceiptProps {
  request_id: string;
  receipt_hash: string;
  kind: string;
  amount_lamports: string;
  /** Public verify URL — defaults to /verify/<receipt_hash>. */
  verifyUrl?: string;
  children: ReactNode;
  className?: string;
}

export function DraggableReceipt({
  request_id,
  receipt_hash,
  kind,
  amount_lamports,
  verifyUrl,
  children,
  className,
}: DraggableReceiptProps) {
  const [dragging, setDragging] = useState(false);
  const url = verifyUrl ?? `/verify/${receipt_hash}`;

  function onDragStart(e: React.DragEvent<HTMLDivElement>) {
    if (typeof window === "undefined") return;
    const fullUrl = `${window.location.origin}${url}`;
    try {
      e.dataTransfer.setData("text/plain", fullUrl);
      e.dataTransfer.setData("text/uri-list", fullUrl);
      e.dataTransfer.setData(
        "application/json",
        JSON.stringify({
          settle: true,
          request_id,
          receipt_hash,
          kind,
          amount_lamports,
          verify_url: fullUrl,
        }),
      );
      e.dataTransfer.effectAllowed = "copyLink";
    } catch {
      // Some browsers restrict setData on cross-origin or reject specific
      // types. We tried; the drag still works for text/plain.
    }
    setDragging(true);
  }

  function onDragEnd() {
    setDragging(false);
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={[
        "transition-transform",
        dragging ? "scale-[0.98] opacity-70" : "",
        "cursor-grab active:cursor-grabbing",
        className ?? "",
      ].join(" ")}
      title="Drag to share — drop on chat, file manager, or any URL-aware target"
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Drop zones — listen for receipt drops and expose what was dropped.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReceiptDropZoneProps {
  /** Called with the dropped receipt's metadata + the JSON payload (when present). */
  onDrop: (receipt: {
    url: string;
    request_id?: string;
    receipt_hash?: string;
    kind?: string;
    amount_lamports?: string;
  }) => void;
  children?: ReactNode;
  /** Visual label when no children are provided. */
  label?: string;
  className?: string;
}

export function ReceiptDropZone({
  onDrop,
  children,
  label = "Drop a receipt here",
  className,
}: ReceiptDropZoneProps) {
  const [over, setOver] = useState(false);

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setOver(false);
    let parsed:
      | {
          settle?: boolean;
          request_id?: string;
          receipt_hash?: string;
          kind?: string;
          amount_lamports?: string;
          verify_url?: string;
        }
      | null = null;
    const json = e.dataTransfer.getData("application/json");
    if (json) {
      try {
        parsed = JSON.parse(json);
      } catch {
        /* ignore malformed JSON */
      }
    }
    const url =
      parsed?.verify_url ??
      e.dataTransfer.getData("text/uri-list") ??
      e.dataTransfer.getData("text/plain") ??
      "";
    if (!url) return;
    const payload: Parameters<typeof onDrop>[0] = { url };
    if (parsed?.request_id) payload.request_id = parsed.request_id;
    if (parsed?.receipt_hash) payload.receipt_hash = parsed.receipt_hash;
    if (parsed?.kind) payload.kind = parsed.kind;
    if (parsed?.amount_lamports) payload.amount_lamports = parsed.amount_lamports;
    onDrop(payload);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={[
        "rounded-2xl border-2 border-dashed p-6 text-center text-xs transition-colors",
        over
          ? "border-accent bg-accent/10 text-accent"
          : "border-foreground/15 bg-foreground/[0.02] text-foreground/50",
        className ?? "",
      ].join(" ")}
    >
      {children ?? <span>{label}</span>}
    </div>
  );
}
