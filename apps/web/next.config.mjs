import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@settle/sdk", "@settle/types", "@settle/ui"],
  experimental: {
    typedRoutes: false,
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
