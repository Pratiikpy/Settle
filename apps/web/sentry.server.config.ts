import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? "development",
    tracesSampleRate: 0.1,
    // Server-side sampling — phase5-signer + indexer get 100% so we
    // never miss a cron fire failure. Other server routes follow the
    // global tracesSampleRate.
    tracesSampler: (ctx) => {
      const name = ctx.transactionContext?.name ?? "";
      if (name.includes("/api/cron/")) return 1.0;
      return 0.1;
    },
    ignoreErrors: ["Failed to fetch", "AbortError"],
  });
}
