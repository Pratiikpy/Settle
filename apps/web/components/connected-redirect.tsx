"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";

/**
 * Auto-redirect from `/` to `/dashboard` when wallet connects. Disabled
 * by default — the marketing page stays the home screen so users can
 * always see it. Opt in with `?go=dashboard` (e.g. for an auth flow
 * that wants to land on the app after sign-in). Honors `?stay=1` as a
 * hard opt-out for screenshots/preview.
 */
export function ConnectedRedirect({ to = "/dashboard" }: { to?: string }) {
  const { connected } = useWallet();
  const router = useRouter();

  useEffect(() => {
    if (!connected) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("stay") === "1") return;
    if (params.get("go") !== "dashboard") return;
    router.push(to);
  }, [connected, router, to]);

  return null;
}
