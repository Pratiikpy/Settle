"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * F1.7 — Theme provider.
 *
 * Resolves theme from (in order):
 *   1. localStorage["settle:theme"] (user override)
 *   2. window.matchMedia("(prefers-color-scheme: dark)") (system)
 *   3. dark (Settle's brand default)
 *
 * The class on <html> is set by `/theme-init.js` (loaded synchronously
 * in the document <head>) BEFORE React hydrates. Without it you'd see a
 * "flash of unstyled theme" — light flash on dark-system users every
 * page load. The provider here is the runtime override + state hook.
 */

type Theme = "dark" | "light" | "auto";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** The actually-applied theme after resolving "auto". */
  resolved: "dark" | "light";
}

const Ctx = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = "settle:theme";

function resolveTheme(t: Theme): "dark" | "light" {
  if (t !== "auto") return t;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(t: "dark" | "light") {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("light", t === "light");
  document.documentElement.classList.toggle("dark", t === "dark");
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [resolved, setResolved] = useState<"dark" | "light">("dark");

  useEffect(() => {
    const stored =
      (typeof window !== "undefined"
        ? (localStorage.getItem(STORAGE_KEY) as Theme | null)
        : null) ?? "auto";
    setThemeState(stored);
    const r = resolveTheme(stored);
    setResolved(r);
    applyTheme(r);

    if (stored === "auto" && typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const onChange = () => {
        const r2 = resolveTheme("auto");
        setResolved(r2);
        applyTheme(r2);
      };
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    return undefined;
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, t);
    }
    const r = resolveTheme(t);
    setResolved(r);
    applyTheme(r);
  }

  return (
    <Ctx.Provider value={{ theme, setTheme, resolved }}>{children}</Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return { theme: "dark", setTheme: () => {}, resolved: "dark" };
  }
  return ctx;
}
