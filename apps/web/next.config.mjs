import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@settle/sdk", "@settle/types", "@settle/ui"],
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
          // HSTS: tell browsers to always use HTTPS for settle.so + subdomains
          // for the next year. Safe in production (Vercel serves HTTPS by
          // default); no effect on localhost per the HSTS spec.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // Isolate the browsing context group while still allowing
          // wallet/Solscan popups via window.open. Without this, a future
          // CSP audit and Spectre-style isolation are harder to enforce.
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
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
