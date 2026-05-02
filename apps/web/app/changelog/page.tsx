import Link from "next/link";
import { W6BentoCard, W6Pill } from "@settle/ui";

export const metadata = {
  title: "Changelog · Settle",
  description: "What shipped.",
};

/**
 * /changelog — Wave 6.1
 *
 * Hand-curated MDX-style entries. Each entry is one verified change
 * that user-facing matters. Short. Honest. Linked to receipts /
 * commits where useful.
 */

const ENTRIES: Array<{
  date: string;
  badge: string;
  title: string;
  body: string;
}> = [
  {
    date: "2026-05-02",
    badge: "Devnet",
    title: "Anchor program v0.2 deployed to devnet",
    body: "Slot 459525733 · 493,944 bytes (+42KB streaming-claim hardening). IDL initialized at 6adGCfQNkk… Both `<settle-pay>` + `<settle-verify>` web components live on npm. `settle-protocol-sdk` v0.2.0 live on PyPI with LangChain + CrewAI adapters. Group-table RLS recursion bug fixed via migration 0049.",
  },
  {
    date: "2026-05-02",
    badge: "Audit",
    title: "Cycle 1 closed, Wave 0–5 EXECUTE_PLAN complete",
    body: "11/11 workspaces typecheck clean. 190 unit tests + 64 E2E tests passing. All AI-doable items in HUMAN_ACTIONS resolved.",
  },
  {
    date: "2026-05-02",
    badge: "UI",
    title: "Wave 6 redesign begins",
    body: "Prototype design system ported (Inter + Outfit + JetBrains Mono, bento cards, surface switcher, mode-pill IA). Landing page rebuilt — every number on the stats strip is real, gated by an `is_presentable` threshold so we never show fake volume.",
  },
];

export default function ChangelogPage() {
  return (
    <div data-w6-page>
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "64px 32px" }}>
        <Link href="/" className="w6-eyebrow">
          ← Settle
        </Link>
        <h1
          className="w6-heading"
          style={{ fontSize: 48, margin: "16px 0 8px", lineHeight: 1.05 }}
        >
          Changelog
        </h1>
        <p className="w6-muted" style={{ fontSize: 16, marginBottom: 40 }}>
          What shipped.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {ENTRIES.map((e, idx) => (
            <W6BentoCard key={idx} hover style={{ padding: 24 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <W6Pill dot={false}>{e.badge}</W6Pill>
                <span className="w6-mono" style={{ fontSize: 11.5, color: "var(--w6-ink-4)" }}>
                  {e.date}
                </span>
              </div>
              <h2
                className="w6-heading"
                style={{ fontSize: 18, margin: 0, lineHeight: 1.3 }}
              >
                {e.title}
              </h2>
              <p
                className="w6-muted"
                style={{ fontSize: 14, lineHeight: 1.6, marginTop: 10 }}
              >
                {e.body}
              </p>
            </W6BentoCard>
          ))}
        </div>
      </main>
    </div>
  );
}
