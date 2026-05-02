import { NextResponse } from "next/server";

/**
 * Dialect Actions Registry manifest (F7).
 *
 * Tells Blink-aware clients (Phantom, Dialect) which routes serve Solana Actions and
 * which on-page URLs to unfurl as Blinks. Spec:
 *   https://solana.com/developers/guides/advanced/actions
 *
 * Submission to Dialect's Actions Registry (so Phantom auto-renders our handle URLs
 * as native pay buttons inside tweets):
 *   1. Deploy this manifest at https://settle.so/.well-known/actions.json
 *   2. Apply at https://dialect.to → Actions Registry submission form
 *   3. Verify domain ownership via DNS TXT record (`_dialect-actions.settle.so`)
 *   4. Once approved, links matching the rules below render as Blinks in X
 *
 * Each rule is a (pathPattern, apiPath) pair. Wildcards `{name}` capture path params and
 * are forwarded to the API path. Phantom's renderer GETs the apiPath when it sees a
 * matching pathPattern in user content.
 */

const MANIFEST = {
  rules: [
    // ── Hire-an-agent flow ──────────────────────────────────────────────
    // Public "Hire this AI agent" Blink — the viral share moment for templates.
    {
      pathPattern: "/blink/{slug}",
      apiPath: "/api/actions/hire/{slug}",
    },

    // ── Universal handle Blinks (F8) ─────────────────────────────────────
    // settle.so/at/zoro                → tip Zoro (default $1/$5/$20 + custom)
    // settle.so/at/zoro?req=20         → "Pay Zoro $20" pinned action
    // settle.so/at/zoro?req=20&note=…  → with memo
    // The router endpoint reads ?req or ?amount from the query string.
    { pathPattern: "/at/{handle}", apiPath: "/api/actions/router/{handle}/tip" },
    { pathPattern: "/at/{handle}/tip", apiPath: "/api/actions/router/{handle}/tip" },
    { pathPattern: "/at/{handle}/pay", apiPath: "/api/actions/router/{handle}/pay" },
    { pathPattern: "/at/{handle}/request", apiPath: "/api/actions/router/{handle}/request" },

    // ── Self-repricing QR endpoints (F9) ─────────────────────────────────
    // Solana Pay transaction-request URLs. Wallet POSTs to the apiPath; server resolves
    // current price + builds the tx. Same QR works forever even when the merchant
    // changes the price.
    { pathPattern: "/qr/{merchant}/{slug}", apiPath: "/api/sp/{merchant}/{slug}" },

    // ── One-time-use payment links (F10) ─────────────────────────────────
    // Single-use tokens. Server marks claimed_at on first POST; subsequent calls return 410.
    { pathPattern: "/pay/{token}", apiPath: "/api/payment-links/{token}" },

    // ── Pay-request Blink for arbitrary slugs ────────────────────────────
    {
      pathPattern: "/request/{slug}",
      apiPath: "/api/actions/request/{slug}",
    },

    // ── Revoke as a Blink (kill switch from anywhere) ────────────────────
    {
      pathPattern: "/cards/{card}/revoke",
      apiPath: "/api/actions/revoke/{card}",
    },
  ],
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Content-Encoding, Accept-Encoding, Authorization",
  "X-Action-Version": "2.4",
  "X-Blockchain-Ids": "solana:devnet",
};

export function GET() {
  return NextResponse.json(MANIFEST, { headers: CORS });
}

export function OPTIONS() {
  return NextResponse.json(null, { headers: CORS });
}
