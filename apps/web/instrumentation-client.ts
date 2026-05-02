/**
 * Next.js 15 App Router client-side instrumentation.
 *
 * Auto-loaded by Next.js on every client navigation. Without this
 * file, sentry.client.config.ts is never imported and the client
 * SDK never initializes. (AU-09-008.)
 *
 * Delegates init to sentry.client.config.ts (which has the existing
 * DSN-guarded Sentry.init for replay, ignoreErrors, etc.).
 *
 * Note: `Sentry.captureRouterTransitionStart` (router-transition trace
 * span hook) is documented for newer SDK versions; not exported by
 * @sentry/nextjs@8.55.2 used here. Navigation spans degrade gracefully
 * via the default browser tracing integration.
 */
import "./sentry.client.config";
