"use client";

/**
 * WAVE_6 — useW6Surface().
 *
 * Reads the active surface from the URL (`?surface=`); falls back to
 * the surface inferred from the connected wallet's roles. Returns
 * `[surface, setSurface]` where setSurface updates the URL.
 *
 * Inference today is simple (consumer for connected, public for not).
 * Wave 6.3 wires up real merchant/agent detection via API. This hook
 * stays the same — its inference improves; consumers don't change.
 */

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { type W6Surface } from "@settle/ui";
import { SURFACE_HOME } from "./w6-surface";

const VALID: W6Surface[] = [
  "consumer",
  "agent",
  "merchant",
  "developer",
  "operator",
  "public",
];

function isValid(s: string | null | undefined): s is W6Surface {
  return !!s && (VALID as string[]).includes(s);
}

export function useW6Surface(): [W6Surface, (next: W6Surface) => void] {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const { connected } = useWallet();

  const fromQuery = params?.get("surface");

  const surface: W6Surface = useMemo(() => {
    // Explicit `?surface=` wins. Lets the surface switcher push the
    // user to a specific surface even on a shared route.
    if (isValid(fromQuery)) return fromQuery;
    // Otherwise infer from the path so a deep-link to /agents shows
    // the agent sidebar without needing the query string.
    if (pathname) {
      if (pathname.startsWith("/agents") || pathname.startsWith("/audit"))
        return "agent";
      if (pathname.startsWith("/m/")) return "merchant";
      if (
        pathname.startsWith("/docs") ||
        pathname === "/sandbox" ||
        pathname.startsWith("/embed")
      )
        return "developer";
      if (
        pathname.startsWith("/control-center") ||
        pathname.startsWith("/admin") ||
        pathname.startsWith("/verify-build")
      )
        return "operator";
      if (
        pathname.startsWith("/verify") ||
        pathname.startsWith("/leaderboard") ||
        pathname.startsWith("/feed") ||
        pathname.startsWith("/stats") ||
        pathname.startsWith("/capabilities") ||
        pathname.startsWith("/help") ||
        pathname.startsWith("/security") ||
        pathname.startsWith("/public-goods") ||
        pathname.startsWith("/blink") ||
        pathname.startsWith("/r/") ||
        pathname.startsWith("/g/")
      )
        return "public";
    }
    return connected ? "consumer" : "public";
  }, [fromQuery, connected, pathname]);

  const setSurface = useCallback(
    (next: W6Surface) => {
      const url = new URL(SURFACE_HOME[next], window.location.origin);
      url.searchParams.set("surface", next);
      // If the user is already on the surface's home, just set the
      // query and stay (avoid an unnecessary route load).
      if (pathname === SURFACE_HOME[next]) {
        router.replace(url.pathname + url.search);
      } else {
        router.push(url.pathname + url.search);
      }
    },
    [pathname, router],
  );

  return [surface, setSurface];
}
