"use client";

/**
 * WAVE_6 — Topbar.
 *
 * Sticky top bar that hosts the SurfaceSwitcher (left), spacer, then
 * ClusterBadge + WalletButton on the right.
 *
 * On mobile (<768px) the main bar shows Logo + WalletButton. A second
 * scrollable pill strip below it exposes the full SurfaceSwitcher —
 * no drawer needed, no hidden navigation.
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

  const handleSurfaceChange = (next: W6Surface) => {
    const url = new URL(SURFACE_HOME[next], window.location.origin);
    url.searchParams.set("surface", next);
    router.push(url.pathname + url.search);
  };

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 10 }}>
      {/* Main bar */}
      <div
        style={{
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
        {/* Mobile: logo only (surface strip is below). */}
        <div className="md:hidden">
          <W6Logo size={22} />
        </div>

        {/* Desktop: full surface switcher in the bar. */}
        <div className="hidden md:block">
          <W6SurfaceSwitcher surface={surface} onChange={handleSurfaceChange} />
        </div>

        <div style={{ flex: 1 }} />

        <div className="hidden sm:block">
          <W6ClusterBadge cluster={cluster} onClick={onClusterClick} />
        </div>
        <W6WalletButton handle={handle} />
      </div>

      {/* Mobile surface strip — scrollable pill row below the main bar. */}
      <div
        className="no-scrollbar md:hidden"
        style={{
          overflowX: "auto",
          overflowY: "hidden",
          padding: "6px 16px 8px",
          background: "rgba(251, 250, 245, 0.95)",
          borderBottom: "1px solid var(--w6-rule)",
        }}
      >
        <W6SurfaceSwitcher surface={surface} onChange={handleSurfaceChange} />
      </div>
    </div>
  );
}
