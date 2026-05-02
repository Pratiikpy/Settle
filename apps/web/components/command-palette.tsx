"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";

/**
 * F1.6 — Global Cmd+K command palette.
 *
 * Behavior:
 *   - Cmd+K (mac) / Ctrl+K (everyone else) toggles
 *   - Esc closes
 *   - Tap outside closes
 *   - Up/Down navigates, Enter selects
 *
 * Action groups:
 *   1. Quick actions — Send, Hire, Verify, Settings
 *   2. Recent receipts (top 5 — fetched lazily on first open)
 *   3. Pubkey/hash detection — if the query looks like a pubkey or hash,
 *      offer "Open address on Solscan" / "Verify hash" actions inline
 *
 * Why this and not a Cmd+K library: keeps the bundle small (no cmdk
 * dependency), keeps the visual identity consistent, and lets us add
 * Settle-specific actions (verify-by-hash, open-card-by-pubkey) without
 * fighting library APIs.
 */

interface ActionItem {
  id: string;
  label: string;
  hint: string;
  group: "actions" | "recent" | "smart";
  onSelect: () => void;
}

const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HEX64_RE = /^[0-9a-f]{64}$/i;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RecentReceipt {
  request_id: string;
  merchant_pubkey: string;
  amount_lamports: string;
  receipt_kind: string | null;
  created_at: string;
}

export function CommandPalette() {
  const router = useRouter();
  const { publicKey } = useWallet();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<RecentReceipt[]>([]);
  const [loadedRecent, setLoadedRecent] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Global keyboard shortcut handler.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isCmdK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lazy-load recent receipts on first open.
  useEffect(() => {
    if (!open || loadedRecent || !publicKey) return;
    setLoadedRecent(true);
    void fetch(`/api/search/receipts?pubkey=${publicKey.toBase58()}&limit=5`)
      .then((r) => r.json())
      .then((j) => {
        if (j.ok) setRecent((j.results ?? []) as RecentReceipt[]);
      })
      .catch(() => {
        // non-fatal
      });
  }, [open, loadedRecent, publicKey]);

  // Focus input when opened.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Tap-outside close.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    setTimeout(() => window.addEventListener("click", onClick), 50);
    return () => window.removeEventListener("click", onClick);
  }, [open]);

  // Build action list dynamically per query.
  const q = query.trim();
  const looksLikePubkey = q.length >= 32 && PUBKEY_RE.test(q);
  const looksLikeHash = HEX64_RE.test(q);
  const looksLikeUuid = UUID_RE.test(q);

  const actions: ActionItem[] = [];

  // 1. Smart matches first.
  if (looksLikeHash) {
    actions.push({
      id: "smart-verify-hash",
      label: `Verify hash: ${q.slice(0, 12)}…`,
      hint: "/verify",
      group: "smart",
      onSelect: () => router.push(`/verify/${q.toLowerCase()}`),
    });
  }
  if (looksLikePubkey) {
    actions.push({
      id: "smart-open-card",
      label: `Open card: ${q.slice(0, 8)}…`,
      hint: "/cards/[id]",
      group: "smart",
      onSelect: () => router.push(`/cards/${q}`),
    });
    actions.push({
      id: "smart-open-solscan",
      label: `View on Solscan: ${q.slice(0, 8)}…`,
      hint: "external",
      group: "smart",
      onSelect: () => {
        window.open(`https://solscan.io/account/${q}?cluster=devnet`, "_blank");
      },
    });
  }
  if (looksLikeUuid) {
    actions.push({
      id: "smart-open-receipt",
      label: `Open receipt: ${q.slice(0, 8)}…`,
      hint: "/receipts/[id]",
      group: "smart",
      onSelect: () => router.push(`/receipts/${q}`),
    });
  }

  // 2. Quick actions, filtered by query.
  const QUICK: Array<Omit<ActionItem, "onSelect"> & { href: string }> = [
    { id: "send", label: "Send USDC", hint: "/send · ⌘S", group: "actions", href: "/send" },
    { id: "hire", label: "Hire an AI agent", hint: "/agents", group: "actions", href: "/agents" },
    { id: "dashboard", label: "Dashboard", hint: "/dashboard", group: "actions", href: "/dashboard" },
    { id: "cards", label: "My cards", hint: "/cards", group: "actions", href: "/cards" },
    { id: "activity", label: "Activity", hint: "/activity", group: "actions", href: "/activity" },
    { id: "feed", label: "Public feed", hint: "/feed", group: "actions", href: "/feed" },
    { id: "settings", label: "Settings", hint: "/settings", group: "actions", href: "/settings" },
    { id: "docs", label: "Developer docs", hint: "/docs", group: "actions", href: "/docs" },
  ];
  for (const a of QUICK) {
    if (q && !a.label.toLowerCase().includes(q.toLowerCase())) continue;
    actions.push({
      id: a.id,
      label: a.label,
      hint: a.hint,
      group: a.group,
      onSelect: () => router.push(a.href),
    });
  }

  // 3. Recent receipts — only when no specific smart match.
  if (!looksLikeHash && !looksLikeUuid) {
    for (const r of recent) {
      const label = `${(Number(r.amount_lamports) / 1e6).toFixed(2)} USDC → ${r.merchant_pubkey.slice(0, 6)}…`;
      if (q && !label.toLowerCase().includes(q.toLowerCase())) continue;
      actions.push({
        id: `recent-${r.request_id}`,
        label,
        hint: `${r.receipt_kind ?? "x402_spend"} · ${new Date(r.created_at).toLocaleDateString()}`,
        group: "recent",
        onSelect: () => router.push(`/receipts/${r.request_id}`),
      });
    }
  }

  // Clamp activeIdx to valid range.
  const safeIdx = Math.max(0, Math.min(actions.length - 1, activeIdx));

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(actions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = actions[safeIdx];
      if (target) {
        target.onSelect();
        setOpen(false);
      }
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-start justify-items-center pt-[12vh]">
      {/* Dim backdrop */}
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />

      <div
        ref={containerRef}
        className="relative w-[min(92vw,560px)] overflow-hidden rounded-2xl border border-foreground/15 bg-background shadow-2xl"
        role="dialog"
        aria-modal="true"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIdx(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Type a command, paste a hash, paste a pubkey…"
          className="w-full border-b border-foreground/10 bg-transparent px-5 py-4 text-base outline-none placeholder:text-foreground/30"
        />

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {actions.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-foreground/40">
              No matches. Try "send", "verify", a pubkey, or a hash.
            </p>
          ) : (
            <ul>
              {actions.map((a, i) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => {
                      a.onSelect();
                      setOpen(false);
                    }}
                    className={
                      "flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition " +
                      (i === safeIdx
                        ? "bg-foreground/10 text-foreground"
                        : "text-foreground/80 hover:bg-foreground/5")
                    }
                  >
                    <span className="flex items-baseline gap-2">
                      {a.group === "smart" && (
                        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">
                          smart
                        </span>
                      )}
                      {a.group === "recent" && (
                        <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-foreground/50">
                          recent
                        </span>
                      )}
                      <span>{a.label}</span>
                    </span>
                    <span className="text-[11px] text-foreground/40">{a.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-foreground/10 px-4 py-2 text-[10px] text-foreground/40">
          <span>↑↓ navigate · ⏎ open · esc close</span>
          <span className="font-mono">⌘K</span>
        </div>
      </div>
    </div>
  );
}
