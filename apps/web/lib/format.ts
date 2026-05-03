/** Convert lamports / smallest-unit string to a displayable USDC amount. */
export function lamportsToUsdc(lamports: bigint | string | number): string {
  const n = typeof lamports === "bigint" ? lamports : BigInt(lamports);
  const whole = n / 1_000_000n;
  const frac = n % 1_000_000n;
  const fracStr = frac.toString().padStart(6, "0").slice(0, 2); // 2 decimal places
  return `${whole}.${fracStr}`;
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
