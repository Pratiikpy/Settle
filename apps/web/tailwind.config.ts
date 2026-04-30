import type { Config } from "tailwindcss";

/**
 * Settle design system.
 * Locked palette: Solana purple #9945FF + Solana green #14F195 + cinematic dark #0A0A0A.
 * Typography: Inter (sans) + JetBrains Mono (numerals/code).
 * Motion: 200ms default, ease-out for entry, ease-in-out for state changes.
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        warn: "rgb(var(--warn) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        // Solana brand fixed
        solana: {
          purple: "#9945FF",
          green: "#14F195",
          dark: "#0A0A0A",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        "display-1": ["clamp(3.5rem, 8vw, 6.5rem)", { lineHeight: "1", letterSpacing: "-0.04em" }],
        "display-2": ["clamp(2.5rem, 6vw, 5rem)", { lineHeight: "1.05", letterSpacing: "-0.03em" }],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        glow: "0 0 50px -10px rgb(var(--accent) / 0.4)",
        "glow-lg": "0 0 100px -20px rgb(var(--accent) / 0.5)",
        card: "0 4px 24px -8px rgba(0,0,0,0.4), inset 0 1px 0 0 rgba(255,255,255,0.06)",
      },
      animation: {
        "fade-in": "fadeIn 400ms ease-out",
        "slide-up": "slideUp 500ms cubic-bezier(0.16, 1, 0.3, 1)",
        "scale-in": "scaleIn 400ms cubic-bezier(0.16, 1, 0.3, 1)",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 12s linear infinite",
        shimmer: "shimmer 2.4s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "200% 0" },
          "100%": { backgroundPosition: "-200% 0" },
        },
      },
      backgroundImage: {
        "purple-gradient": "linear-gradient(135deg, #9945FF 0%, #14F195 100%)",
        "shimmer-gradient":
          "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)",
      },
      backgroundSize: {
        "200%": "200% 100%",
      },
    },
  },
  plugins: [],
};

export default config;
