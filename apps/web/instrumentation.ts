import * as Sentry from "@sentry/nextjs";

/**
 * Next.js 15 App Router server-side instrumentation hook.
 *
 * Without this file, the Sentry SDK never initializes on the server —
 * every Sentry.captureException call in /api/cron/phase5-signer becomes
 * a silent no-op. (AU-09-008.)
 *
 * Pattern from https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Capture errors thrown during request handling (Server Components,
// middleware, route handlers). Without this, server-side React errors
// don't surface in Sentry.
export const onRequestError = Sentry.captureRequestError;
