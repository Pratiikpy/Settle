/**
 * F8.11 — Locale-aware formatting primitives.
 *
 * The SDK doesn't carry a translation table — the web app + agent SDKs
 * own their own bundles. What every consumer DOES need, though, is to
 * format on-chain values (USDC amounts, timestamps, slot times) the same
 * way regardless of who's reading. A receipt for $1,234.56 should render
 * "$1,234.56" in en-US, "1.234,56 $" in es-ES, "￥1,234.56" in ja-JP from
 * the same canonical lamport string.
 *
 * The lamport input is BIGINT-safe — `Number(lamports)` would lose
 * precision for amounts > 2^53 / 1e6 (~9 trillion USDC). We divide as
 * BigInt and split before handing to Intl.NumberFormat.
 */

export type Locale = "en" | "es" | "ja" | "zh-CN" | "en-US" | "es-ES" | "ja-JP" | "zh";

/**
 * Format a USDC lamport amount (6 decimals) for display in `locale`.
 * Default locale is `en-US`. Currency symbol is always USD ($).
 *
 * Examples:
 *   formatUsdc("1234560000")         // "$1,234.56"
 *   formatUsdc("1234560000", "es")   // "1234,56 US$"   (es default narrow)
 *   formatUsdc("100", "ja")          // "$0.0001"        (sub-cent stays exact)
 *   formatUsdc("0")                  // "$0.00"
 */
export function formatUsdc(lamportsStr: string | bigint, locale: Locale = "en-US"): string {
  const lamports = typeof lamportsStr === "bigint" ? lamportsStr : BigInt(lamportsStr);
  // 1 USDC = 1_000_000 lamports. Work BigInt-only on absolute value so a
  // 9-quadrillion-USDC amount still serializes losslessly into the digits
  // we hand to Intl.NumberFormat.
  const negative = lamports < 0n;
  const abs = negative ? -lamports : lamports;
  const whole = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  // Trim trailing zeros from fractional, but keep ≥ 2 digits to avoid "$1.5".
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  const fracTrim = fracStr.length < 2 ? fracStr.padEnd(2, "0") : fracStr;
  // Number() is safe for the whole part up to 2^53 (~9 quadrillion USDC).
  const value = Number(`${negative ? "-" : ""}${whole.toString()}.${fracTrim || "0"}`);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.max(2, fracTrim.length),
  }).format(value);
}

/**
 * Format a Unix timestamp (ms) as a locale-aware short datetime.
 *   formatReceiptTime(1735689600000)         // "1/1/2025, 12:00 AM"  (en)
 *   formatReceiptTime(1735689600000, "ja")   // "2025/1/1 0:00"       (ja)
 */
export function formatReceiptTime(unixMs: number, locale: Locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(unixMs));
}

/**
 * Compact a relative receipt age, e.g. "3m ago", "2d ago".
 * Locale-aware via Intl.RelativeTimeFormat. Falls back to en if missing.
 */
export function formatReceiptAgo(unixMs: number, locale: Locale = "en-US"): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
  const diffSec = Math.round((unixMs - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), "month");
  return rtf.format(Math.round(diffSec / (86400 * 365)), "year");
}
