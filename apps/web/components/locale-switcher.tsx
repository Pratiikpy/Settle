"use client";

import { useTranslate, type Locale, LOCALES } from "../lib/i18n";

const LABELS: Record<Locale, string> = {
  en: "EN",
  es: "ES",
  ja: "JA",
  "zh-CN": "中",
};

const TITLES: Record<Locale, string> = {
  en: "English",
  es: "Español",
  ja: "日本語",
  "zh-CN": "中文 (简体)",
};

/**
 * Compact locale switcher meant for the page header. Renders a row
 * of two-letter codes; clicking flips the locale instantly via the
 * settle:locale-change CustomEvent that useTranslate() listens for.
 *
 * Why two-letter not full names: header real-estate is precious; the
 * full names live in /settings/language. Hover gives the full name as
 * `title` so screen readers get the context.
 */
export function LocaleSwitcher({
  className = "",
}: {
  className?: string;
}) {
  const { locale, setLocale } = useTranslate();
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-full border border-foreground/10 bg-foreground/[0.02] p-0.5 ${className}`}
      role="group"
      aria-label="Language"
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => setLocale(l)}
          title={TITLES[l]}
          className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors ${
            locale === l
              ? "bg-accent text-background"
              : "text-foreground/50 hover:text-foreground"
          }`}
        >
          {LABELS[l]}
        </button>
      ))}
    </div>
  );
}
