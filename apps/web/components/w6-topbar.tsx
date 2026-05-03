"use client";

/**
 * WAVE_6 — Topbar.
 *
 * Sticky top bar that hosts the SurfaceSwitcher (left), spacer, then
 * ClusterBadge + WalletButton on the right.
 *
 * On mobile (<768px) the SurfaceSwitcher is replaced by the Logo +
 * WalletButton, with the surface switcher reachable via a drawer
 * (TODO Wave 6.5).
 */

import { useRouter } from "next/navigation";
import {
  W6SurfaceSwitcher,
  W6ClusterBadge,
  W6Logo,
  type W6Surface,
  type W6Cluster,
} from "@settle/ui";
import { W6WalletButton } from "./w6-wallet-button";
import { SURFACE_HOME } from "../lib/w6-surface";

interface W6TopbarProps {
  surface: W6Surface;
  cluster: W6Cluster;
  handle?: string | null | undefined;
  onClusterClick?: (() => void) | undefined;
}

export function W6Topbar({
  surface,
  cluster,
  handle,
  onClusterClick,
}: W6TopbarProps) {
  const router = useRouter();

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 14,
        height: 58,
        padding: "0 20px",
        background: "rgba(251, 250, 245, 0.9)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--w6-rule)",
      }}
    >
      {/* Mobile logo (sidebar is hidden on <md). */}
      <div className="md:hidden">
        <W6Logo size={22} />
      </div>

      {/* Desktop surface switcher. */}
      <div className="hidden md:block">
        <W6SurfaceSwitcher
          surface={surface}
          onChange={(next) => {
            const url = new URL(SURFACE_HOME[next], window.location.origin);
            url.searchParams.set("surface", next);
            router.push(url.pathname + url.search);
          }}
        />
      </div>

      <div style={{ flex: 1 }} />

      <div className="hidden sm:block">
        <W6ClusterBadge cluster={cluster} onClick={onClusterClick} />
      </div>
      <W6WalletButton handle={handle} />
    </div>
  );
}
