import { type ReactNode } from "react";

/**
 * WAVE_6 — cluster badge.
 *
 * Indicates whether the app is connected to devnet or mainnet. Mainnet
 * dot pulses softly. Devnet dot is amber + static (intentional — devnet
 * money isn't real, signal that visually).
 *
 * Click hands off to `onClick` so consumers can open a popover with
 * RPC health, program ID, etc. — this primitive doesn't ship the
 * popover, just the trigger surface.
 */

export type W6Cluster = "devnet" | "mainnet" | "localnet" | "testnet";

export interface W6ClusterBadgeProps {
  cluster: W6Cluster;
  onClick?: (() => void) | undefined;
  trailing?: ReactNode;
}

const CLUSTER_LABEL: Record<W6Cluster, string> = {
  devnet: "devnet",
  mainnet: "mainnet",
  localnet: "localnet",
  testnet: "testnet",
};

export function W6ClusterBadge({
  cluster,
  onClick,
  trailing,
}: W6ClusterBadgeProps) {
  const isMainnet = cluster === "mainnet";
  const dotColor = isMainnet ? "var(--w6-mainnet)" : "var(--w6-warn-cluster)";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Solana cluster: ${cluster}`}
      aria-label={`Solana cluster: ${cluster}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 30,
        padding: "0 12px",
        borderRadius: 999,
        border: "1px solid var(--w6-rule)",
        background: "#fff",
        fontSize: 12,
        color: "var(--w6-ink-2)",
        fontWeight: 500,
      }}
    >
      <span
        className={isMainnet ? "w6-cluster-pulse" : ""}
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: dotColor,
          boxShadow: isMainnet
            ? "0 0 0 3px rgba(16, 185, 129, 0.18)"
            : "0 0 0 3px rgba(245, 158, 11, 0.18)",
        }}
      />
      <span className="w6-mono" style={{ fontSize: 11, letterSpacing: 0.02 }}>
        {CLUSTER_LABEL[cluster]}
      </span>
      {trailing}
    </button>
  );
}
