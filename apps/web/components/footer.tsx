import Link from "next/link";
import { VerifiableBuildBadge } from "./verifiable-build-badge";

/**
 * Wave 6 — site footer.
 *
 * Inline W6 styles so it reads light-on-light correctly even on legacy
 * routes that haven't been migrated to W6AppShell yet. Avoids
 * `text-[#09090b]/X` Tailwind classes which flip with html.dark and
 * produced unreadable text on the W6 prototype palette.
 */
export function Footer() {
  return (
    <footer
      style={{
        marginTop: 96,
        borderTop: "1px solid var(--w6-rule)",
        padding: "48px 24px",
        background: "var(--w6-bg-2)",
        color: "var(--w6-ink)",
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 32,
          flexWrap: "wrap",
        }}
        className="w6-footer-grid"
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 32,
            flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: 320 }}>
            <div
              className="w6-heading"
              style={{ fontSize: 18, fontWeight: 600 }}
            >
              Settle
            </div>
            <p
              className="w6-muted"
              style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}
            >
              Pay anyone. Hire any AI. Trust the receipts. The payment app
              for the AI age. On Solana.
            </p>
            <p
              style={{ marginTop: 16, fontSize: 10.5, color: "var(--w6-ink-4)" }}
            >
              Solana Frontier 2026 · MIT-licensed SDK
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 32,
              fontSize: 12,
            }}
            className="w6-footer-cols"
          >
            <FooterCol
              title="Product"
              links={[
                { label: "Get started", href: "/onboarding" },
                { label: "Hire AI", href: "/agents" },
                { label: "Send", href: "/send" },
                { label: "Cards", href: "/cards" },
              ]}
            />
            <FooterCol
              title="Build"
              links={[
                { label: "Docs", href: "/docs" },
                { label: "Public Goods", href: "/public-goods" },
                {
                  label: "GitHub",
                  href: "https://github.com/Pratiikpy/settle-protocol",
                  external: true,
                },
                { label: "Security", href: "/security" },
              ]}
            />
            <FooterCol
              title="Status"
              links={[
                { label: "Health", href: "/api/health" },
                { label: "Live feed", href: "/feed" },
                { label: "Devnet sandbox", href: "/sandbox" },
                { label: "Help", href: "/help" },
              ]}
            />
          </div>
        </div>

        <div
          style={{
            marginTop: 24,
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            paddingTop: 24,
            borderTop: "1px solid var(--w6-rule-2)",
            fontSize: 10.5,
            color: "var(--w6-ink-4)",
            flexWrap: "wrap",
          }}
        >
          <div>© 2026 Settle Protocol contributors · MIT licensed</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <VerifiableBuildBadge />
            <div className="w6-mono">
              {process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet"}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 720px) {
          .w6-footer-cols {
            grid-template-columns: 1fr 1fr !important;
          }
        }
      `}</style>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: Array<{ label: string; href: string; external?: boolean }>;
}) {
  return (
    <div>
      <div
        className="w6-eyebrow"
        style={{ marginBottom: 12, fontSize: 11 }}
      >
        {title}
      </div>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          color: "var(--w6-ink-2)",
        }}
      >
        {links.map((l) => (
          <li key={l.label}>
            {l.external ? (
              <a
                href={l.href}
                style={{
                  color: "var(--w6-ink-2)",
                  textDecoration: "none",
                }}
              >
                {l.label}
              </a>
            ) : (
              <Link
                href={l.href}
                style={{
                  color: "var(--w6-ink-2)",
                  textDecoration: "none",
                }}
              >
                {l.label}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
