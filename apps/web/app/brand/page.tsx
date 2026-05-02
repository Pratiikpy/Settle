import Link from "next/link";
import { W6Logo, W6BentoCard, W6Pill } from "@settle/ui";

export const metadata = {
  title: "Brand · Settle",
  description: "Logo, tokens, fonts. Use them.",
};

/**
 * /brand — Wave 6.1
 *
 * Brand kit page: logo download (SVG), color tokens, type scale, do/don't.
 * One scrollable page; no auth required.
 */

const COLORS: Array<{ name: string; value: string; rgb: string }> = [
  { name: "Ink", value: "#09090b", rgb: "9, 9, 11" },
  { name: "Ink-2", value: "#27272a", rgb: "39, 39, 42" },
  { name: "Ink-3", value: "#52525b", rgb: "82, 82, 91" },
  { name: "Rule", value: "#e4e4e7", rgb: "228, 228, 231" },
  { name: "Background", value: "#FDFDFD", rgb: "253, 253, 253" },
  { name: "Accent (link)", value: "#3b82f6", rgb: "59, 130, 246" },
  { name: "Mainnet", value: "#10b981", rgb: "16, 185, 129" },
  { name: "Devnet warn", value: "#f59e0b", rgb: "245, 158, 11" },
  { name: "Bad / DENY", value: "#b3261e", rgb: "179, 38, 30" },
];

export default function BrandPage() {
  return (
    <div data-w6-page>
      <main style={{ maxWidth: 1080, margin: "0 auto", padding: "64px 32px" }}>
        <div style={{ marginBottom: 40 }}>
          <Link href="/" className="w6-eyebrow">
            ← Settle
          </Link>
          <h1
            className="w6-heading"
            style={{ fontSize: 48, margin: "16px 0 8px", lineHeight: 1.05 }}
          >
            Brand
          </h1>
          <p className="w6-muted" style={{ fontSize: 16, maxWidth: 540 }}>
            Logo, tokens, fonts. Use them.
          </p>
        </div>

        <section style={{ marginBottom: 48 }}>
          <h2
            className="w6-heading"
            style={{ fontSize: 22, marginBottom: 16 }}
          >
            Logo
          </h2>
          <W6BentoCard style={{ padding: 32 }}>
            <div
              style={{
                display: "flex",
                gap: 32,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  width: 96,
                  height: 96,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <W6Logo size={64} wordmark={false} />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <W6Logo size={32} />
                <p
                  className="w6-muted"
                  style={{ fontSize: 13, marginTop: 16, lineHeight: 1.55 }}
                >
                  Two streams settling into a single anchor point — the
                  receipt. Mark + wordmark, paired. Mark stands alone where
                  space is tight (favicons, app icons, social avatars).
                </p>
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <a
                    href="/logo.svg"
                    download
                    className="w6-btn w6-btn-secondary w6-btn-sm"
                  >
                    Download SVG
                  </a>
                </div>
              </div>
            </div>
          </W6BentoCard>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2
            className="w6-heading"
            style={{ fontSize: 22, marginBottom: 16 }}
          >
            Colors
          </h2>
          <div className="w6-grid-3">
            {COLORS.map((c) => (
              <W6BentoCard key={c.name} variant="flat" style={{ padding: 20 }}>
                <div
                  style={{
                    height: 64,
                    borderRadius: 12,
                    background: c.value,
                    border:
                      c.value.toLowerCase() === "#fdfdfd"
                        ? "1px solid var(--w6-rule)"
                        : "0",
                    marginBottom: 12,
                  }}
                />
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                <div className="w6-mono" style={{ fontSize: 12, color: "var(--w6-ink-3)" }}>
                  {c.value}
                </div>
                <div className="w6-mono" style={{ fontSize: 11, color: "var(--w6-ink-4)" }}>
                  rgb({c.rgb})
                </div>
              </W6BentoCard>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2
            className="w6-heading"
            style={{ fontSize: 22, marginBottom: 16 }}
          >
            Type
          </h2>
          <W6BentoCard style={{ padding: 32 }}>
            <div className="w6-eyebrow">Outfit · headings</div>
            <div
              className="w6-heading"
              style={{ fontSize: 56, marginTop: 8, lineHeight: 1.05 }}
            >
              Programmable money.
            </div>
            <div className="w6-eyebrow" style={{ marginTop: 32 }}>
              Inter · body
            </div>
            <p
              style={{ fontSize: 16, marginTop: 8, lineHeight: 1.6 }}
              className="w6-muted"
            >
              Settle helps humans, agents, merchants, and teams move money
              through plain-English rules, verifiable receipts, and trust-building reputation.
            </p>
            <div className="w6-eyebrow" style={{ marginTop: 32 }}>
              JetBrains Mono · code & data
            </div>
            <pre
              className="w6-mono"
              style={{
                margin: "8px 0 0",
                padding: 16,
                background: "var(--w6-ink)",
                color: "#fff",
                borderRadius: 12,
                fontSize: 13,
                lineHeight: 1.7,
              }}
            >
              {"settle.pay({ pact: \"delivery-escrow\" })"}
            </pre>
          </W6BentoCard>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2
            className="w6-heading"
            style={{ fontSize: 22, marginBottom: 16 }}
          >
            Do / Don&apos;t
          </h2>
          <div className="w6-grid-3">
            <W6BentoCard variant="flat" style={{ padding: 20 }}>
              <W6Pill tone="ok">Do</W6Pill>
              <p style={{ fontSize: 14, marginTop: 12, lineHeight: 1.55 }}>
                Use the wordmark in product chrome (sidebar, topbar, footer). Pair with the mark.
              </p>
            </W6BentoCard>
            <W6BentoCard variant="flat" style={{ padding: 20 }}>
              <W6Pill tone="ok">Do</W6Pill>
              <p style={{ fontSize: 14, marginTop: 12, lineHeight: 1.55 }}>
                Use the mark alone for favicon, app icon, social avatar — square contexts.
              </p>
            </W6BentoCard>
            <W6BentoCard variant="flat" style={{ padding: 20 }}>
              <W6Pill tone="bad">Don&apos;t</W6Pill>
              <p style={{ fontSize: 14, marginTop: 12, lineHeight: 1.55 }}>
                Stretch, recolor, or place on busy backgrounds. Keep at least 16px clear-space.
              </p>
            </W6BentoCard>
          </div>
        </section>

        <p className="w6-muted" style={{ fontSize: 12 }}>
          Questions? Open an issue at github.com/Pratiikpy/settle-protocol.
        </p>
      </main>
    </div>
  );
}
