/** Convert lamports / smallest-unit string to a displayable USDC amount. */
export function lamportsToUsdc(lamports: bigint | string | number): string {
  const n = typeof lamports === "bigint" ? lamports : BigInt(lamports);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").slice(0, 2); // 2 decimal places
  return `${whole}.${fracStr}`;
}

/** Truncate a base58 pubkey for display: "Card1111…1111a". */
export function truncateAddress(addr: string, chars = 4): string {
  if (addr.length <= chars * 2) return addr;
  return `${addr.slice(0, chars)}…${addr.slice(-chars)}`;
}

/** Format a Solana cluster + tx signature as a Solscan URL. */
export function solscanUrl(sig: string, cluster: "mainnet" | "devnet" = "devnet"): string {
  return `https://solscan.io/tx/${sig}?cluster=${cluster}`;
}

/** ms-precision elapsed-time formatter for the demo: "0.4s on Solana". */
export function formatLatencyMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Format a timestamp delta as "2m ago" / "1h ago". */
export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const sec = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
