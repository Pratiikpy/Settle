"use client";

import { useState } from "react";

/**
 * Share buttons for the public receipt poster /r/[id].
 *
 * - "Tweet" → opens Twitter intent with the receipt URL prefilled.
 * - "Copy link" → copies the page URL to the clipboard, flips the
 *   button label briefly so the user gets feedback.
 *
 * Client-side only; the server-rendered poster page mounts this
 * inline. Buttons inherit the W6 visual language from poster styles.
 */
export function ReceiptShareButtons({
  receiptId,
  amountUsdc,
  decision,
}: {
  receiptId: string;
  amountUsdc: string;
  decision: "ALLOW" | "DENY" | null;
}) {
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? window.location.href
      : `https://settle.so/r/${receiptId}`;
  const verb = decision === "DENY" ? "blocked" : "verified";
  const tweet = `Just ${verb} a $${amountUsdc} USDC payment on @solana with a cryptographic receipt anyone can verify. ↓`;
  const twitterIntent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    tweet,
  )}&url=${encodeURIComponent(url)}`;

  async function copy() {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2_000);
      }
    } catch {
      /* ignore — clipboard may be blocked in sandboxed contexts */
    }
  }

  return (
    <>
      <a
        data-testid="receipt-share-twitter"
        href={twitterIntent}
        target="_blank"
        rel="noreferrer"
        style={{
          padding: "10px 16px",
          borderRadius: 10,
          background: "#fff",
          color: "#0a0a0c",
          fontWeight: 600,
          fontSize: 14,
          textDecoration: "none",
          border: "1px solid rgba(0,0,0,0.12)",
        }}
      >
        Tweet ↗
      </a>
      <button
        data-testid="receipt-share-copy"
        onClick={copy}
        type="button"
        style={{
          padding: "10px 16px",
          borderRadius: 10,
          background: "#fff",
          color: copied ? "#1f9d55" : "#0a0a0c",
          fontWeight: 600,
          fontSize: 14,
          border: `1px solid ${copied ? "#1f9d55" : "rgba(0,0,0,0.12)"}`,
          cursor: "pointer",
        }}
      >
        {copied ? "✓ Copied" : "Copy link"}
      </button>
    </>
  );
}
