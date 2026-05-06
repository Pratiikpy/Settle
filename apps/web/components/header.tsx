"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { WalletButton } from "./wallet-button-client";
import { W6Logo } from "@settle/ui";

// Routes that ship with their own chrome (Wave 6 redesign). The legacy
// header is hidden on these so we don't double-render.
const W6_REDESIGNED_PREFIXES = [
  "/", // landing — exact match handled below
  "/brand",
  "/changelog",
  "/privacy",
  "/terms",
  "/dashboard",
  "/send",
  "/ledger",
  "/cards",
  "/groups",
  "/wishes",
  "/allowances",
  "/activity",
  "/settings",
  "/receipts",
  "/at",
  "/onboarding",
  "/spending",
  "/audit",
  "/sandbox",
  "/agents",
  "/m",
  "/import",
  "/split-bill",
  "/verify",
  "/leaderboard",
  "/control-center",
  "/notifications",
  "/docs",
  "/capabilities",
  "/feed",
  "/stats",
  "/help",
  "/security",
  "/public-goods",
  "/admin",
  "/blink",
  "/collab",
  "/pay",
  "/qr",
  "/g",
  "/claim",
  "/r",
  "/embed",
  "/request",
  "/verify-build",
  "/start",
  "/watch",
];

/**
 * Wave 6 — header for legacy routes that don't yet wrap in
 * `<W6AppShell>`. Styled in the prototype palette (light bg, dark ink)
 * so it doesn't clash with W6 page bodies. W6 routes hide it via the
 * prefix list above.
 */
export function Header() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  // Bug #49 fix: SSR was rendering the legacy header on / (the landing
  // page) because the static-prerender path was producing the legacy
  // chrome before the W6 layout took over. Two-stage guard:
  //   (1) never render on SSR/initial hydration — that kills the flash
  //   (2) on client, apply the path allowlist
  // Trade-off: legacy pages briefly show no header on first paint. That's
  // strictly better than the landing rendering double headers stacked.
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  // Defensive: handle missing/empty pathname as "hide" (safer default).
  if (!pathname || pathname === "/" || pathname === "") {
    return null;
  }

  if (
    W6_REDESIGNED_PREFIXES.some((p) => p !== "/" && pathname.startsWith(p))
  ) {
    return null;
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "rgba(253, 253, 253, 0.85)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--w6-rule)",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          gap: 16,
        }}
      >
        <Link
          href="/"
          aria-label="Settle home"
          style={{ textDecoration: "none", color: "var(--w6-ink)" }}
        >
          <W6Logo size={22} />
        </Link>
        <nav
          className="hidden md:flex"
          style={{
            alignItems: "center",
            gap: 24,
            fontSize: 13.5,
            color: "var(--w6-ink-2)",
          }}
        >
          {[
            { href: "/send", label: "Send" },
            { href: "/agents", label: "Agents" },
            { href: "/cards", label: "Pacts" },
            { href: "/feed", label: "Feed" },
            { href: "/activity", label: "Activity" },
            { href: "/sandbox", label: "Sandbox" },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{
                color: "var(--w6-ink-2)",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
