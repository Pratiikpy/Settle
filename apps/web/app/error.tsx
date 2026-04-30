"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[settle] uncaught:", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="text-6xl font-semibold tracking-tight text-danger">!</div>
      <h1 className="mt-6 text-2xl font-medium">Something broke</h1>
      <p className="mt-3 text-sm text-foreground/60">
        An unexpected error occurred. The on-chain state is unaffected — only this UI render
        failed.
      </p>
      {error.digest && (
        <code className="mt-4 rounded bg-foreground/5 px-3 py-1.5 text-[10px] font-mono text-foreground/40">
          digest: {error.digest}
        </code>
      )}
      <div className="mt-8 flex gap-3">
        <button
          onClick={reset}
          className="rounded-full bg-accent px-6 py-2 text-sm font-medium text-background"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-full border border-foreground/20 px-6 py-2 text-sm hover:bg-foreground/5"
        >
          Home
        </a>
      </div>
    </main>
  );
}
