import { Inter, Outfit, JetBrains_Mono } from "next/font/google";

/**
 * WAVE_6 — typography for the redesigned shell.
 *
 * Loaded once at the root layout; exposed as CSS custom properties via
 * `className` on <html>. Components consume via `var(--font-w6-*)`.
 *
 * `display: "swap"` so any FOUT is text in the system stack rather than
 * invisible-until-font-loaded; performance budget allows the swap.
 */

export const w6Sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-w6-sans",
  display: "swap",
});

export const w6Heading = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-w6-heading",
  display: "swap",
});

export const w6Mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-w6-mono",
  display: "swap",
});
