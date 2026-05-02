"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { W6AppShell } from "../../components/w6-app-shell";

interface VerifyBuildResponse {
  ok: boolean;
  program_id?: string;
  program_data_address?: string;
  upgrade_authority?: string | null;
  on_chain?: {
    sha256: string;
    sized_against_build_info: boolean;
    raw_code_bytes: number;
  };
  claimed?: {
    sha256: string;
    size_bytes: number;
    commit: string;
    dirty: boolean;
    built_at: string;
    builder: { hostname: string; platform: string; arch: string };
  } | null;
  matches?: boolean | null;
  error?: string;
  message?: string;
}

/**
 * F9.1 — Public verifiable-build page.
 *
 * Anyone can land here, see the on-chain bytecode hash side-by-side with
 * the committed source-of-truth hash, and verify the deployed program is
 * exactly the code at the published commit.
 *
 * The "reproduce this yourself" block tells a curious developer the exact
 * 4 commands they'd run on their own machine to confirm the match.
 */
export default function VerifyBuildPage() {
  const [data, setData] = useState<VerifyBuildResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch("/api/verify-build")
      .then((r) => r.json())
      .then((j) => setData(j as VerifyBuildResponse))
      .catch((e) => setData({ ok: false, error: String(e) }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <W6AppShell forceSurface="operator">
      <div style={{ maxWidth: 880 }}>
        <div className="text-xs text-foreground/40">F9.1 · Verifiable build</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Trust the code, not the claim
        </h1>
        <p className="mt-2 text-sm text-foreground/60 max-w-xl">
          The Settle program runs on devnet at a fixed program ID. This page
          shows the SHA-256 of the on-chain bytecode side-by-side with the
          hash committed to git at the source-of-truth commit. If they
          match, the binary you&apos;re trusting is exactly the code anyone
          can read in the repo.
        </p>

        {loading && (
          <p className="mt-8 text-sm text-foreground/50">Reading on-chain account…</p>
        )}

        {data && data.ok && data.on_chain && (
          <>
            {/* Verdict */}
            <section
              className={
                "mt-8 rounded-2xl border p-5 " +
                (data.matches
                  ? "border-emerald-400/30 bg-emerald-400/[0.05]"
                  : data.matches === false
                    ? "border-amber-400/30 bg-amber-400/[0.05]"
                    : "border-foreground/15 bg-foreground/[0.02]")
              }
            >
              <p className="text-sm font-medium">
                {data.matches
                  ? "✓ On-chain bytecode matches the committed source"
                  : data.matches === false
                    ? "⚠ Hashes differ — investigate"
                    : "ℹ No build-info.json committed yet"}
              </p>
              <p className="mt-1 text-xs text-foreground/60">
                {data.matches
                  ? "The program running on devnet is byte-identical to the .so produced by building the repo at the commit below."
                  : data.matches === false
                    ? "Either the deployed binary was upgraded without a new build-info commit, or the committed build-info is stale. The hashes below help diagnose."
                    : "Run `pnpm exec tsx scripts/compute-program-hash.ts` after `cargo build-sbf`, then commit the resulting build-info.json."}
              </p>
            </section>

            {/* Side-by-side hashes */}
            <section className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
                <p className="text-[11px] uppercase tracking-wide text-foreground/50">
                  on-chain (devnet)
                </p>
                <p className="mt-3 break-all font-mono text-xs text-foreground/85">
                  {data.on_chain.sha256}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-foreground/50">
                  <span>raw bytes</span>
                  <span className="font-mono">{data.on_chain.raw_code_bytes}</span>
                  <span>trimmed</span>
                  <span>{data.on_chain.sized_against_build_info ? "yes" : "no"}</span>
                </div>
              </div>

              <div className="rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
                <p className="text-[11px] uppercase tracking-wide text-foreground/50">
                  claimed (build-info.json)
                </p>
                {data.claimed ? (
                  <>
                    <p className="mt-3 break-all font-mono text-xs text-foreground/85">
                      {data.claimed.sha256}
                    </p>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] text-foreground/50">
                      <span>size</span>
                      <span className="font-mono">
                        {data.claimed.size_bytes} bytes
                      </span>
                      <span>commit</span>
                      <span className="break-all font-mono">
                        {data.claimed.commit.slice(0, 8)}
                        {data.claimed.dirty ? " (dirty)" : ""}
                      </span>
                      <span>built</span>
                      <span>
                        {new Date(data.claimed.built_at).toLocaleString()}
                      </span>
                      <span>builder</span>
                      <span className="font-mono">
                        {data.claimed.builder.platform}/{data.claimed.builder.arch}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-xs text-foreground/40">
                    No build-info.json committed yet.
                  </p>
                )}
              </div>
            </section>

            {/* Authority + program details */}
            <section className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
              <h2 className="text-sm font-medium">Program details</h2>
              <div className="mt-3 grid grid-cols-[140px,1fr] gap-y-2 text-xs">
                <span className="text-foreground/50">program id</span>
                <code className="break-all font-mono text-foreground/80">
                  {data.program_id}
                </code>
                <span className="text-foreground/50">program data</span>
                <code className="break-all font-mono text-foreground/80">
                  {data.program_data_address}
                </code>
                <span className="text-foreground/50">upgrade authority</span>
                <code className="break-all font-mono text-foreground/80">
                  {data.upgrade_authority ?? "(immutable)"}
                </code>
              </div>
            </section>

            {/* How to reproduce */}
            <section className="mt-6 rounded-2xl border border-foreground/10 bg-white/[0.02] p-5">
              <h2 className="text-sm font-medium">Reproduce it yourself</h2>
              <p className="mt-1 text-xs text-foreground/50">
                Four commands. ~15 seconds on a modern machine.
              </p>
              <pre className="mt-3 overflow-x-auto rounded-xl bg-black/30 p-4 text-xs text-foreground/80">
                <code>{`git clone https://github.com/anthropics/settle-protocol.git
cd settle-protocol
git checkout ${data.claimed?.commit ?? "<commit>"}
cargo build-sbf --manifest-path programs/settle-agent-card/Cargo.toml --tools-version v1.54
sha256sum programs/settle-agent-card/target/deploy/settle_agent_card.so
# expected: ${data.claimed?.sha256 ?? "<hash>"}`}</code>
              </pre>
            </section>
          </>
        )}

        {data && !data.ok && (
          <section className="mt-8 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-5 text-sm text-red-300">
            <p className="font-medium">Could not verify</p>
            <p className="mt-2 text-xs text-red-200/70">
              {data.message ?? data.error}
            </p>
          </section>
        )}

        <div className="mt-12 flex gap-3">
          <Link
            href="/docs"
            className="inline-flex h-10 items-center rounded-full border border-foreground/20 px-5 text-xs hover:bg-foreground/5"
          >
            ← Docs
          </Link>
          <a
            href="https://github.com/anthropics/settle-protocol"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center rounded-full border border-foreground/20 px-5 text-xs hover:bg-foreground/5"
          >
            GitHub ↗
          </a>
        </div>
      </div>
    </W6AppShell>
  );
}
