"use client";

/**
 * WAVE_6 — Sidebar.
 *
 * Sticky 232px left rail. Logo top, nav sections per active surface,
 * "You" footer card. Hidden on <768px (mobile uses bottom-tab + drawer
 * — see W6BottomTab).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { W6Logo, type W6Surface } from "@settle/ui";
import { NAV_BY_SURFACE } from "../lib/w6-surface";
import { W6Icon } from "./w6-icons";

interface W6SidebarProps {
  surface: W6Surface;
  /** Optional unread-count for "Notifications" badge. */
  unread?: number | undefined;
  /** Optional handle override; otherwise fetched via /api/handles/by-pubkey. */
  handle?: string | null | undefined;
  /** Optional trust score override. */
  trustScore?: number | null | undefined;
  /** Optional follower count override. */
  followers?: number | null | undefined;
}

export function W6Sidebar({
  surface,
  unread,
  handle: handleOverride,
  trustScore: trustOverride,
  followers: followersOverride,
}: W6SidebarProps) {
  const pathname = usePathname();
  const { publicKey, disconnect } = useWallet();
  const sections = NAV_BY_SURFACE[surface];

  // If the parent didn't pass a handle, fetch it ourselves so the
  // "You" footer card has something real to show on every W6 page —
  // not just the dashboard. Cached per-pubkey via the browser.
  const [fetchedHandle, setFetchedHandle] = useState<string | null>(null);
  useEffect(() => {
    if (handleOverride !== undefined && handleOverride !== null) return;
    if (!publicKey) {
      setFetchedHandle(null);
      return;
    }
    const pk = publicKey.toBase58();
    let cancelled = false;
    fetch(`/api/handles/by-pubkey?pubkey=${encodeURIComponent(pk)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { handle?: string } | null) => {
        if (!cancelled && j?.handle) setFetchedHandle(j.handle);
      })
      .catch(() => {
        /* handle is decorative */
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey, handleOverride]);

  const handle = handleOverride ?? fetchedHandle;
  const trustScore = trustOverride;
  const followers = followersOverride;
  const pubkeyShort = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : null;
  const initial = (
    handle?.[0] ??
    publicKey?.toBase58()[0] ??
    "?"
  ).toUpperCase();

  return (
    <aside
      aria-label="Primary"
      className="hidden md:flex"
      style={{
        position: "sticky",
        top: 0,
        height: "100vh",
        width: 232,
        padding: "20px 14px",
        background: "var(--w6-paper)",
        borderRight: "1px solid var(--w6-rule)",
        flexDirection: "column",
        overflowY: "auto",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: "4px 8px 18px" }}>
        <Link href="/" aria-label="Settle home">
          <W6Logo size={22} />
        </Link>
      </div>

      {sections.map((section, idx) => (
        <div key={idx} style={{ marginBottom: 12 }}>
          {section.section ? (
            <div
              className="w6-eyebrow"
              style={{ padding: "12px 8px 6px", fontSize: 10.5 }}
            >
              {section.section}
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {section.items.map((item) => {
              // A nav item is "active" only when:
              //   - exact path match, OR
              //   - the current path is a sub-path of this item (so /cards/[id]
              //     activates "Pacts → /cards"), but ONLY when no other item
              //     has a more-specific (longer) match.
              // The previous logic used a plain startsWith which made TWO items
              // activate at once when one href was a prefix of another (e.g.
              // /m/me/manage activated both "Overview" /m/me/manage AND
              // "Public profile" /m/me). Pick the longest-prefix winner.
              const allHrefs = section.items.map((i) => i.href);
              const longestPrefixMatch = pathname
                ? allHrefs
                    .filter((h) => pathname === h || (pathname.startsWith(h + "/")))
                    .sort((a, b) => b.length - a.length)[0]
                : undefined;
              const active =
                pathname === item.href ||
                (item.href !== "/" &&
                  item.href !== "/dashboard" &&
                  longestPrefixMatch === item.href);

              // Bug #25: profile/merchant nav items hardcoded to /at/me and
              // /m/me — but those aren't pubkey/handle-aware. Rewrite at
              // render time to /at/<own-handle> and /m/<own-handle>/<sub>
              // when we know the user's handle, so "Profile" actually opens
              // the user's profile and not a generic /at/me 'not found'.
              let resolvedHref = item.href;
              if (handle) {
                if (item.href === "/at/me") resolvedHref = `/at/${handle}`;
                else if (item.href.startsWith("/m/me"))
                  resolvedHref = item.href.replace("/m/me", `/m/${handle}`);
              }
              return (
                <Link
                  key={item.href + item.label}
                  href={resolvedHref}
                  aria-current={active ? "page" : undefined}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: active ? 600 : 500,
                    color: active ? "var(--w6-ink)" : "var(--w6-ink-3)",
                    background: active ? "#fff" : "transparent",
                    border: active
                      ? "1px solid var(--w6-rule)"
                      : "1px solid transparent",
                    transition: "background 140ms, color 140ms",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 18,
                    }}
                  >
                    <W6Icon name={item.icon} />
                  </span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badgeKey === "unread" && unread && unread > 0 ? (
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 600,
                        padding: "1px 6px",
                        borderRadius: 999,
                        background: "var(--w6-ink)",
                        color: "#fff",
                      }}
                    >
                      {unread}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ marginTop: "auto", padding: "24px 8px 0" }}>
        {publicKey ? (
          <Link
            href={handle ? `/at/${handle}` : "/settings"}
            className="w6-card w6-card-hover"
            style={{
              padding: 14,
              display: "block",
              textDecoration: "none",
              color: "var(--w6-ink)",
            }}
            aria-label="Open your profile"
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--w6-ink)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {initial}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  className="w6-heading"
                  style={{ fontSize: 13.5, lineHeight: 1.2 }}
                >
                  {handle ? `@${handle}` : pubkeyShort}
                </div>
                <div
                  className="w6-muted"
                  style={{
                    fontSize: 11,
                    lineHeight: 1.3,
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {trustScore != null
                    ? `Trust ${trustScore}${followers != null ? ` · ${followers} followers` : ""}`
                    : handle
                      ? pubkeyShort
                      : "Tap to claim a handle"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void disconnect();
              }}
              style={{
                marginTop: 12,
                width: "100%",
                padding: "5px 8px",
                fontSize: 11,
                background: "transparent",
                border: "1px solid var(--w6-rule)",
                borderRadius: 6,
                color: "var(--w6-ink-3)",
                cursor: "pointer",
              }}
            >
              Disconnect
            </button>
          </Link>
        ) : (
          <div
            className="w6-card-flat"
            style={{
              padding: 14,
              fontSize: 12,
              lineHeight: 1.4,
              color: "var(--w6-ink-3)",
            }}
          >
            Connect a wallet to see your profile.
          </div>
        )}
      </div>
    </aside>
  );
}
