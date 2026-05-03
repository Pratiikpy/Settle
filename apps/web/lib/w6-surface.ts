/**
 * WAVE_6 — surface helpers shared by Sidebar / Topbar / hooks.
 *
 * Single source of truth for the 6-mode IA. Maps each surface to:
 *   - sidebar nav sections (icons, labels, hrefs)
 *   - default landing route when switching INTO that surface
 *
 * Routes here MUST already exist in `apps/web/app/`. New routes (e.g.
 * agent templates page) get added under their proper surface as they
 * ship.
 */

import { type W6Surface } from "@settle/ui";

export interface NavItem {
  label: string;
  href: string;
  icon: NavIconName;
  badgeKey?: "unread";
}

export interface NavSection {
  /** Uppercase label above the group; null = first/unlabeled section. */
  section: string | null;
  items: NavItem[];
}

export type NavIconName =
  | "home"
  | "send"
  | "receipt"
  | "layers"
  | "users"
  | "piggy"
  | "calendar"
  | "eye"
  | "bell"
  | "settings"
  | "bot"
  | "spark"
  | "activity"
  | "shield"
  | "hash"
  | "grid"
  | "globe"
  | "code"
  | "terminal";

export const NAV_BY_SURFACE: Record<W6Surface, NavSection[]> = {
  consumer: [
    {
      section: null,
      items: [
        { icon: "home", label: "Home", href: "/dashboard" },
        { icon: "send", label: "Send", href: "/send" },
        { icon: "receipt", label: "Receipts", href: "/ledger" },
        { icon: "layers", label: "Pacts", href: "/cards" },
      ],
    },
    {
      section: "Money",
      items: [
        { icon: "users", label: "Groups", href: "/groups" },
        { icon: "piggy", label: "Savings", href: "/wishes" },
        { icon: "calendar", label: "Schedule", href: "/allowances" },
      ],
    },
    {
      section: "Tools",
      items: [
        { icon: "hash", label: "Import receipt", href: "/import" },
        { icon: "grid", label: "Split bill", href: "/split-bill" },
        { icon: "spark", label: "Share via Blink", href: "/blink/research" },
      ],
    },
    {
      section: "You",
      items: [
        { icon: "eye", label: "Profile", href: "/at/me" },
        { icon: "bell", label: "Notifications", href: "/activity", badgeKey: "unread" },
        { icon: "settings", label: "Settings", href: "/settings" },
      ],
    },
  ],
  agent: [
    {
      section: null,
      items: [
        { icon: "home", label: "Overview", href: "/agents" },
        { icon: "bot", label: "Agent cards", href: "/cards" },
        { icon: "layers", label: "Pacts", href: "/cards?type=pact" },
        { icon: "spark", label: "Templates", href: "/agents/templates" },
      ],
    },
    {
      section: "Live",
      items: [
        { icon: "activity", label: "Decisions", href: "/audit" },
        { icon: "receipt", label: "Receipts", href: "/ledger?role=agent" },
        { icon: "shield", label: "Caps & rules", href: "/audit" },
      ],
    },
  ],
  merchant: [
    {
      section: null,
      items: [
        { icon: "home", label: "Overview", href: "/m/me/manage" },
        { icon: "eye", label: "Public profile", href: "/m/me" },
        { icon: "hash", label: "Capabilities", href: "/m/me/capabilities" },
      ],
    },
    {
      section: "Sell",
      items: [
        { icon: "grid", label: "QR & links", href: "/m/me/qr" },
        { icon: "activity", label: "Disputes", href: "/m/me/disputes" },
        { icon: "layers", label: "Webhooks", href: "/m/me/webhook" },
      ],
    },
    {
      section: "Trust",
      items: [
        { icon: "globe", label: "Verify domain", href: "/m/me/verify" },
        { icon: "spark", label: "Analytics", href: "/m/me/analytics" },
      ],
    },
  ],
  developer: [
    {
      section: null,
      items: [
        { icon: "home", label: "Docs", href: "/docs" },
        { icon: "code", label: "SDKs", href: "/docs/sdks" },
        { icon: "terminal", label: "MCP middleware", href: "/docs/mcp" },
      ],
    },
    {
      section: "Embed",
      items: [
        { icon: "layers", label: "Pay component", href: "/docs/pay-component" },
        { icon: "hash", label: "Verify component", href: "/docs/verify-component" },
        { icon: "activity", label: "Webhooks", href: "/docs/webhooks" },
      ],
    },
    {
      section: "Tools",
      items: [
        { icon: "spark", label: "API explorer", href: "/docs/api" },
        { icon: "bot", label: "Sandbox", href: "/sandbox" },
      ],
    },
  ],
  operator: [
    {
      section: null,
      items: [
        { icon: "home", label: "Health", href: "/control-center" },
        { icon: "activity", label: "Cron", href: "/admin/cron" },
        { icon: "globe", label: "Federation", href: "/admin/federation/origins" },
        { icon: "shield", label: "Preflight", href: "/admin/preflight" },
        { icon: "code", label: "Verify build", href: "/verify-build" },
      ],
    },
  ],
  public: [
    {
      section: null,
      items: [
        { icon: "hash", label: "Verify", href: "/verify" },
        { icon: "grid", label: "Heatmap", href: "/leaderboard" },
        { icon: "layers", label: "Capabilities", href: "/capabilities/discover" },
        { icon: "globe", label: "Federation", href: "/leaderboard" },
        { icon: "activity", label: "Stats", href: "/stats" },
        { icon: "eye", label: "Public feed", href: "/feed" },
      ],
    },
  ],
};

/** Route to land on when a user switches INTO `surface`. */
export const SURFACE_HOME: Record<W6Surface, string> = {
  consumer: "/dashboard",
  agent: "/agents",
  merchant: "/m/me/manage",
  developer: "/docs",
  operator: "/control-center",
  public: "/verify",
};
