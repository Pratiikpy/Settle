"use client";

/**
 * Next.js 15 App Router root error boundary.
 *
 * Catches errors thrown anywhere in the App Router tree that bubble
 * past per-route error.tsx boundaries. Without this file, root-level
 * errors render the Next default page and never reach Sentry. (AU-09-008.)
 *
 * Pattern from https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/
 */
import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
