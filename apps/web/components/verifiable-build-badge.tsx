"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * F9.1 — Verifiable build badge.
 *
 * Tiny pill that lives in the footer / homepage. Lazy-fetches /api/verify-build,
 * shows ✓/⚠/loading. Click → /verify-build full page.
 *
 * Why this matters as a homepage badge: it's the lowest-friction way to
 * communicate "this protocol's deployed code is publicly verifiable." A
 * curious visitor sees "build verified · commit abc1234" and can click
 * to see the math.
 */
interface VerifyBuildResponse {
  ok: boolean;
  matches?: boolean | null;
  claimed?: { commit: string } | null;
}

export function VerifiableBuildBadge({ className }: { className?: string }) {
  const [state, setState] = useState<"loading" | "ok" | "warn" | "fail">("loading");
  const [commit, setCommit] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/verify-build")
      .then((r) => r.json())
      .then((j: VerifyBuildResponse) => {
        if (cancelled) return;
        setCommit(j.claimed?.commit?.slice(0, 7) ?? null);
        if (!j.ok) setState("fail");
        else if (j.matches === true) setState("ok");
        else setState("warn");
      })
      .catch(() => {
        if (!cancelled) setState("fail");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tone =
    state === "ok"
      ? "border-emerald-400/30 text-emerald-700"
      : state === "warn"
        ? "border-amber-400/30 text-amber-700"
        : state === "fail"
          ? "border-red-400/30 text-red-300"
          : "border-[#e4e4e7] text-[#52525b]";

  return (
    <Link
      href="/verify-build"
      title="Click to see the on-chain bytecode hash side-by-side with the source-of-truth hash."
      className={[
        "inline-flex items-center gap-2 rounded-full border bg-[#fafafa] px-3 py-1 text-[10px] uppercase tracking-wide hover:bg-white/[0.06]",
        tone,
        className ?? "",
      ].join(" ")}
    >
      <span>
        {state === "loading"
          ? "build · checking…"
          : state === "ok"
            ? "build · verified ✓"
            : state === "warn"
              ? "build · review"
              : "build · offline"}
      </span>
      {commit && (
        <span className="font-mono lowercase text-[#71717a]">
          {commit}
        </span>
      )}
    </Link>
  );
}
