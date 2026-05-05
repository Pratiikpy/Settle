import { withSentryConfig } from "@sentry/nextjs";

// Wallet adapters require unsafe-eval for their internal WASM/crypto bootstrapping.
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https: wss:",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Embed pages live inside merchant iframes — must allow any host to frame them.
const EMBED_CSP_DIRECTIVES = CSP_DIRECTIVES.replace(
  "frame-ancestors 'none'",
  "frame-ancestors *",
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@settle/sdk", "@settle/types", "@settle/ui"],
  // AUDIT BRANCH ONLY: enable the SettleE2EBurnerWalletAdapter so the
  // "E2E Persona" option appears in the wallet modal. Lets Playwright
  // drive the deployed UI with a seeded keypair (no Phantom needed).
  // DO NOT MERGE THIS BRANCH TO MAIN — production must NOT have burner
  // enabled. The bundled keypair would let anyone sign as the test wallet.
  env: {
    NEXT_PUBLIC_E2E_BURNER: "1",
  },
  experimental: {
    typedRoutes: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
          { key: "Content-Security-Policy", value: CSP_DIRECTIVES },
        ],
      },
      {
        // Embed pages are iframed by merchant sites — remove the DENY and
        // allow any parent origin via frame-ancestors in CSP.
        source: "/embed/:path*",
        headers: [
          { key: "X-Frame-Options", value: "ALLOWALL" },
          { key: "Content-Security-Policy", value: EMBED_CSP_DIRECTIVES },
        ],
      },
    ];
  },
  webpack: (config) => {
    // @solana/kit ships ESM; some sub-packages need fallback for fs/crypto in browser bundle.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };
    // The @settle/sdk source uses ES-module-style ".js" imports for .ts files
    // (NodeNext/bundler-style). Map ".js" → ".ts" so webpack resolves them.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

// Wrap with Sentry only if DSN is configured. Skipping the wrapper
// when no DSN is set keeps dev startup fast and avoids forcing every
// developer to install/configure Sentry locally.
const sentryDsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const config = sentryDsn
  ? withSentryConfig(nextConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      widenClientFileUpload: true,
      hideSourceMaps: true,
      disableLogger: true,
    })
  : nextConfig;

export default config;
