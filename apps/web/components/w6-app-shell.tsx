"use client";

/**
 * WAVE_6 — App shell.
 *
 * Wraps any authed page with the redesigned chrome (sidebar + topbar +
 * bottom-tab on mobile). Sets `data-w6="1"` on the document body so
 * `globals.css` swaps in the prototype palette + fonts only for the
 * pages that opt in — legacy routes keep their old look until reskinned.
 *
 * Usage:
 *   <W6AppShell>
 *     {/* page content goes inside the main column *\/}
 *   </W6AppShell>
 */

import { type ReactNode, useEffect, useState } from "react";
import { W6Sidebar } from "./w6-sidebar";
import { W6Topbar } from "./w6-topbar";
import { W6BottomTab } from "./w6-bottom-tab";
import { useW6Surface } from "../lib/use-w6-surface";

interface W6AppShellProps {
  children: ReactNode;
  /** Optional: override surface. Default = useW6Surface(). */
  forceSurface?: ReturnType<typeof useW6Surface>[0] | undefined;
  /** Show the dev-net warning strip. Default true if cluster=devnet. */
  showDevnetBanner?: boolean | undefined;
}

export function W6AppShell({
  children,
  forceSurface,
  showDevnetBanner: showBanner,
}: W6AppShellProps) {
  const [hookSurface] = useW6Surface();
  const surface = forceSurface ?? hookSurface;

  const cluster = (process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet") as
    | "devnet"
    | "mainnet"
    | "localnet"
    | "testnet";

  const showDevnet =
    showBanner ?? (cluster === "devnet" || cluster === "localnet");

  // Set body[data-w6] so the CSS overrides only apply to opted-in pages.
  useEffect(() => {
    document.body.setAttribute("data-w6", "1");
    return () => {
      document.body.removeAttribute("data-w6");
    };
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <W6Sidebar surface={surface} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {showDevnet ? <DevnetBanner /> : null}
        <W6Topbar surface={surface} cluster={cluster} />
        <main
          style={{
            flex: 1,
            padding: "20px clamp(14px, 3vw, 28px) 88px",
            maxWidth: "100%",
          }}
        >
          {children}
        </main>
      </div>
      <W6BottomTab surface={surface} />
    </div>
  );
}

function DevnetBanner() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div
      role="region"
      aria-label="Devnet notice"
      style={{
        background: "var(--w6-paper)",
        borderBottom: "1px dashed var(--w6-rule-warm)",
        padding: "8px 16px",
        fontSize: 12,
        color: "var(--w6-ink-2)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "var(--w6-warn-cluster)",
        }}
      />
      <span style={{ flex: 1 }}>
        You&apos;re on devnet. No real money moves.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="w6-btn w6-btn-ghost"
        style={{ height: 28, padding: "0 8px", fontSize: 11 }}
      >
        Dismiss
      </button>
    </div>
  );
}
