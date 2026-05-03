"use client";

/**
 * WAVE_6 — wallet button.
 *
 * Disconnected: primary "Connect wallet" pill — opens existing wallet
 * adapter modal via `useWalletModal()`.
 *
 * Connected: avatar chip with @handle + truncated pubkey + click →
 * popover with Disconnect / Copy address / View on Solscan.
 *
 * Uses existing wallet adapter; doesn't reinvent.
 */

import { useState, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { toast } from "sonner";

interface W6WalletButtonProps {
  handle?: string | null | undefined;
}

export function W6WalletButton({ handle }: W6WalletButtonProps) {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  if (!connected || !publicKey) {
    return (
      <button
        type="button"
        className="w6-btn w6-btn-primary w6-btn-sm"
        onClick={() => setVisible(true)}
        aria-label="Connect Solana wallet"
      >
        Connect wallet
      </button>
    );
  }

  const pubkey = publicKey.toBase58();
  const short = `${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`;
  const initial = (handle?.[0] ?? pubkey[0] ?? "?").toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          height: 32,
          padding: "0 4px 0 12px",
          borderRadius: 6,
          border: "1px solid var(--w6-rule)",
          background: "var(--w6-paper-2)",
          cursor: "pointer",
        }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--w6-ink)" }}>
          {handle ? `@${handle}` : "Connected"}
        </span>
        <span
          className="w6-mono"
          style={{ fontSize: 11, color: "var(--w6-ink-4)" }}
        >
          {short}
        </span>
        <span
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            background: "var(--w6-ink)",
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          {initial}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: 220,
            padding: 6,
            border: "1px solid var(--w6-rule)",
            borderRadius: 8,
            background: "var(--w6-paper-2)",
            boxShadow: "var(--w6-shadow-md)",
            zIndex: 50,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              navigator.clipboard.writeText(pubkey).then(() => {
                toast.success("Address copied");
                setOpen(false);
              });
            }}
            className="w6-btn w6-btn-ghost"
            style={{ width: "100%", justifyContent: "flex-start", height: 36 }}
          >
            Copy address
          </button>
          <a
            role="menuitem"
            href={`https://solscan.io/account/${pubkey}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="w6-btn w6-btn-ghost"
            style={{ width: "100%", justifyContent: "flex-start", height: 36 }}
          >
            View on Solscan ↗
          </a>
          <div
            style={{
              height: 1,
              background: "var(--w6-rule)",
              margin: "4px 0",
            }}
          />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void disconnect();
              setOpen(false);
            }}
            className="w6-btn w6-btn-ghost"
            style={{
              width: "100%",
              justifyContent: "flex-start",
              height: 36,
              color: "var(--w6-bad)",
            }}
          >
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  );
}
