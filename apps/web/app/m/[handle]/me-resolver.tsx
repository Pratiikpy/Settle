"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";

/**
 * /m/me — wallet-aware redirect.
 *
 * Server-side, /m/[handle] can't read the connected wallet, so /m/me would
 * 404 (no merchant has the literal handle "me"). This client island
 * resolves the connected wallet's merchant handle via /api/handles/by-pubkey
 * and redirects to /m/{handle}, or shows a "claim a merchant handle" CTA
 * if the wallet hasn't claimed one yet.
 */
export function MerchantMeResolver() {
  const router = useRouter();
  const { connected, publicKey } = useWallet();
  const [state, setState] = useState<
    "loading" | "no-wallet" | "no-handle" | "redirecting"
  >("loading");

  useEffect(() => {
    if (!connected || !publicKey) {
      setState("no-wallet");
      return;
    }
    let cancelled = false;
    void fetch(`/api/handles/by-pubkey?pubkey=${publicKey.toBase58()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { handle?: string } | null) => {
        if (cancelled) return;
        if (data?.handle) {
          setState("redirecting");
          router.replace(`/m/${data.handle}`);
        } else {
          setState("no-handle");
        }
      })
      .catch(() => {
        if (!cancelled) setState("no-handle");
      });
    return () => {
      cancelled = true;
    };
  }, [connected, publicKey, router]);

  return (
    <div
      className="mx-auto max-w-md text-center"
      style={{ padding: "64px 24px" }}
    >
      {state === "loading" || state === "redirecting" ? (
        <>
          <h1 className="w6-heading" style={{ fontSize: 24, margin: 0 }}>
            Resolving merchant…
          </h1>
          <p className="w6-muted" style={{ marginTop: 12, fontSize: 13 }}>
            Looking up your handle.
          </p>
        </>
      ) : state === "no-wallet" ? (
        <>
          <h1 className="w6-heading" style={{ fontSize: 28, margin: 0 }}>
            Connect a wallet
          </h1>
          <p className="w6-muted" style={{ marginTop: 12, fontSize: 14 }}>
            Connect a Solana wallet to view or claim your merchant handle.
          </p>
        </>
      ) : (
        <>
          <h1 className="w6-heading" style={{ fontSize: 28, margin: 0 }}>
            No merchant handle yet
          </h1>
          <p className="w6-muted" style={{ marginTop: 12, fontSize: 14 }}>
            Your wallet hasn’t claimed a merchant handle on Settle.
          </p>
          <Link
            href="/onboarding"
            className="w6-btn w6-btn-primary"
            style={{ marginTop: 32 }}
          >
            Claim a handle
          </Link>
        </>
      )}
    </div>
  );
}
