import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "development",
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    integrations: [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })],
    ignoreErrors: [
      "Failed to fetch",
      "NetworkError",
      "AbortError",
      /UnsafeBurnerWalletAdapter/i,
    ],
  });
}
