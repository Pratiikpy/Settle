import Link from "next/link";
import {
  W6Logo,
  W6BentoCard,
  W6BentoGrid,
  W6Pill,
} from "@settle/ui";
import { ConnectedRedirect } from "../components/connected-redirect";
import { LandingStatsStrip } from "../components/w6-landing-stats";
import { LandingWaitlistForm } from "../components/w6-landing-waitlist";
import { LandingWalletAdapter } from "../components/w6-landing-wallet";

export const dynamic = "force-static";
export const revalidate = 300;

/**
 * Wave 6.1 — Landing page.
 *
 * Replaces the previous 175-line marketing placeholder with the prototype's
 * `screen-landing.jsx` shape. Every number on the page is real (or hidden) —
 * the stats strip queries `/api/stats/landing` and gates on `is_presentable`.
 *
 * `data-w6` attribute is set on a wrapper so the prototype palette + fonts
 * apply only here (legacy authed routes keep their old look until reskinned).
 */

export default function Home() {
  return (
    <div data-w6-page>
      <ConnectedRedirect />
      <NavMarketing />
      <main className="w6-landing">
        <Hero />
        <LandingStatsStrip />
        <ProductSurface />
        <MadeForEveryone />
        <ForBuilders />
        <TrustLayer />
        <FinalCTA />
      </main>
      <FooterMarketing />

      {/* Inline page-scoped CSS — applies the prototype palette only to this
          tree. Avoids polluting the global theme used by legacy routes. */}
      <style>{`
        [data-w6-page] {
          background: var(--w6-bg-2);
          color: var(--w6-ink);
          font-family: var(--font-w6-sans), -apple-system, system-ui, sans-serif;
          letter-spacing: -0.005em;
          min-height: 100vh;
          overflow-x: hidden;
        }
        /* Plain links inherit body color. The .w6-btn-* rules in
           globals.css carry !important so buttons keep their palette. */
        [data-w6-page] a {
          color: inherit;
          text-decoration: none;
        }
        [data-w6-page] pre { white-space: pre-wrap; word-break: break-word; }
        .w6-landing { padding-bottom: 24px; }
        .w6-section { max-width: 1280px; margin: 0 auto; padding: 0 32px; }
        @media (max-width: 640px) {
          .w6-section { padding: 0 16px; }
        }
      `}</style>
    </div>
  );
}

/* ============================================================ */
/* Marketing nav                                                 */
/* ============================================================ */

function NavMarketing() {
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        padding: "20px 0",
        background: "rgba(253, 253, 253, 0.85)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--w6-rule)",
      }}
    >
      <div
        className="w6-section"
        style={{ display: "flex", alignItems: "center", gap: 24 }}
      >
        <Link href="/" aria-label="Settle home">
          <W6Logo size={22} />
        </Link>
        <div
          className="hidden md:flex"
          style={{ gap: 28, marginLeft: 32 }}
        >
          <Link
            href="/docs"
            className="w6-muted"
            style={{ fontSize: 13.5, fontWeight: 500 }}
          >
            Product
          </Link>
          <Link
            href="/leaderboard"
            className="w6-muted"
            style={{ fontSize: 13.5, fontWeight: 500 }}
          >
            Receipts
          </Link>
          <Link
            href="/docs"
            className="w6-muted"
            style={{ fontSize: 13.5, fontWeight: 500 }}
          >
            Docs
          </Link>
          <Link
            href="/docs"
            className="w6-muted"
            style={{ fontSize: 13.5, fontWeight: 500 }}
          >
            API
          </Link>
        </div>
        <div style={{ flex: 1 }} />
        <Link
          href="/verify"
          className="w6-btn w6-btn-ghost w6-btn-sm hidden sm:inline-flex"
        >
          Verify a receipt
        </Link>
        <LandingWalletAdapter />
        <Link href="#request-access" className="w6-btn w6-btn-primary w6-btn-sm">
          Request access →
        </Link>
      </div>
    </nav>
  );
}

/* ============================================================ */
/* Hero                                                          */
/* ============================================================ */

function Hero() {
  return (
    <section
      className="w6-section"
      style={{ padding: "64px 32px 32px", maxWidth: 1280, margin: "0 auto" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.05fr 0.95fr",
          gap: 48,
          alignItems: "center",
        }}
        className="w6-hero-grid"
      >
        <div>
          <W6Pill tone="neutral">Solana-native payments app</W6Pill>
          <h1
            className="w6-heading"
            style={{
              fontSize: "clamp(40px, 7vw, 76px)",
              margin: "24px 0 22px",
              lineHeight: 1.02,
            }}
          >
            Programmable money for the AI age.
          </h1>
          <p
            className="w6-muted"
            style={{
              fontSize: 17.5,
              lineHeight: 1.55,
              maxWidth: 560,
              margin: 0,
            }}
          >
            Settle helps humans, agents, merchants, and teams move money
            through plain-English rules, verifiable receipts, and trust-building
            reputation.
          </p>
          <div id="request-access" style={{ marginTop: 32 }}>
            <LandingWaitlistForm source="landing" />
          </div>
          <Link
            href="/dashboard?demo=1"
            className="w6-btn w6-btn-ghost"
            style={{
              marginTop: 16,
              padding: 0,
              height: "auto",
              display: "inline-flex",
            }}
          >
            Open product preview →
          </Link>
          <div
            style={{
              display: "flex",
              gap: 14,
              marginTop: 28,
              fontSize: 12.5,
              color: "var(--w6-ink-4)",
              fontWeight: 500,
              flexWrap: "wrap",
            }}
          >
            <span>Public proof.</span>
            <span
              style={{
                width: 3,
                height: 3,
                borderRadius: "50%",
                background: "var(--w6-ink-5)",
                alignSelf: "center",
              }}
            />
            <span>Private memos.</span>
            <span
              style={{
                width: 3,
                height: 3,
                borderRadius: "50%",
                background: "var(--w6-ink-5)",
                alignSelf: "center",
              }}
            />
            <span>Human control.</span>
          </div>
        </div>
        <AgentCardDemo />
      </div>
      <style>{`
        @media (max-width: 880px) {
          .w6-hero-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

function AgentCardDemo() {
  return (
    <W6BentoCard style={{ minHeight: 420, position: "relative" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <span className="w6-eyebrow">Agent policy</span>
        <span style={{ flex: 1 }} />
        <W6Pill tone="ok">Live</W6Pill>
      </div>

      <pre
        className="w6-mono"
        style={{
          background: "var(--w6-ink)",
          color: "#fff",
          borderRadius: 16,
          padding: 22,
          fontSize: 12.5,
          lineHeight: 1.85,
          overflow: "auto",
          margin: 0,
        }}
      >
        <span style={{ color: "#a1a1aa" }}>settle</span>.agentCard.
        <span style={{ color: "#fbbf24" }}>create</span>({"{"}
        {"\n  dailyCap: "}
        <span style={{ color: "#86efac" }}>&quot;$500&quot;</span>,{"\n  allow: ["}
        <span style={{ color: "#86efac" }}>&quot;data-api&quot;</span>,{" "}
        <span style={{ color: "#86efac" }}>&quot;creator&quot;</span>{"],\n  expires: "}
        <span style={{ color: "#86efac" }}>&quot;Friday 5pm&quot;</span>
        {",\n  receipt: "}
        <span style={{ color: "#86efac" }}>&quot;public-proof&quot;</span>
        {"\n})"}
      </pre>

      <div
        style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22 }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: "var(--w6-ink)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 15,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          R
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Research Agent</div>
          <div className="w6-muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            $500 / day · allowlist · expires Fri
          </div>
        </div>
        <button type="button" className="w6-btn w6-btn-secondary w6-btn-sm">
          Revoke
        </button>
      </div>
    </W6BentoCard>
  );
}

/* ============================================================ */
/* Product surface                                               */
/* ============================================================ */

function ProductSurface() {
  return (
    <section
      className="w6-section"
      style={{ padding: "80px 32px 40px", maxWidth: 1280, margin: "0 auto" }}
    >
      <div style={{ maxWidth: 720, marginBottom: 40 }}>
        <span className="w6-eyebrow">Product surface</span>
        <h2
          className="w6-heading"
          style={{ fontSize: 44, margin: "12px 0 0", lineHeight: 1.1 }}
        >
          Money movement that explains itself before and after it happens.
        </h2>
      </div>
      <W6BentoGrid>
        <W6BentoCard span={2} rowSpan={2} hover>
          <SurfaceCardHeader eyebrow="AgentCard" />
          <h3
            className="w6-heading"
            style={{ fontSize: 26, margin: 0, lineHeight: 1.15 }}
          >
            Bounded spending power for AI agents.
          </h3>
          <p
            className="w6-muted"
            style={{
              fontSize: 14,
              lineHeight: 1.6,
              marginTop: 14,
              maxWidth: 460,
            }}
          >
            Give an agent a daily cap, allowlist, expiry, and purpose — then
            revoke it instantly if behavior changes.
          </p>
          <div
            className="w6-card-flat"
            style={{ padding: 18, marginTop: 24, background: "#fff" }}
          >
            <div style={{ display: "flex", gap: 12 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--w6-ink)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 17,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                R
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  Research Agent
                </div>
                <div className="w6-muted" style={{ fontSize: 12.5 }}>
                  spending today
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="w6-heading" style={{ fontSize: 18 }}>
                  $184
                  <span
                    className="w6-muted"
                    style={{ fontSize: 13, fontWeight: 400 }}
                  >
                    {" "}
                    / $500
                  </span>
                </div>
              </div>
            </div>
            <div
              style={{
                height: 6,
                background: "var(--w6-rule-2)",
                borderRadius: 999,
                marginTop: 12,
                overflow: "hidden",
              }}
              role="progressbar"
              aria-valuenow={37}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                style={{
                  width: "37%",
                  height: "100%",
                  background: "var(--w6-ink)",
                  borderRadius: 999,
                }}
              />
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                marginTop: 14,
                flexWrap: "wrap",
              }}
            >
              <W6Pill dot={false}>$500 / day</W6Pill>
              <W6Pill dot={false}>Allowlist · 4</W6Pill>
              <W6Pill dot={false}>Expiry · Fri</W6Pill>
            </div>
          </div>
        </W6BentoCard>

        <W6BentoCard span={2} hover>
          <SurfaceCardHeader eyebrow="Receipts" />
          <h3
            className="w6-heading"
            style={{ fontSize: 22, margin: 0, lineHeight: 1.2 }}
          >
            Verifiable proof for every movement.
          </h3>
          <p
            className="w6-muted"
            style={{ fontSize: 13.5, lineHeight: 1.55, marginTop: 10 }}
          >
            Receipts explain who paid, what rule allowed it, what changed
            on-chain, and what can happen next.
          </p>
        </W6BentoCard>

        <W6BentoCard hover>
          <SurfaceCardHeader eyebrow="Rules" />
          <h3
            className="w6-heading"
            style={{ fontSize: 18, margin: 0, lineHeight: 1.25 }}
          >
            Plain-English controls before signatures.
          </h3>
          <p
            className="w6-muted"
            style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 10 }}
          >
            Users see the budget, refund window, merchant trust, and privacy
            state before money moves.
          </p>
        </W6BentoCard>

        <W6BentoCard hover>
          <SurfaceCardHeader eyebrow="Pacts" />
          <h3
            className="w6-heading"
            style={{ fontSize: 18, margin: 0, lineHeight: 1.25 }}
          >
            Task-scoped agreements for teams and agents.
          </h3>
          <p
            className="w6-muted"
            style={{ fontSize: 12.5, lineHeight: 1.55, marginTop: 10 }}
          >
            OneShot, Streaming, and DeliveryEscrow flows keep outcomes clear
            without crypto jargon.
          </p>
        </W6BentoCard>
      </W6BentoGrid>
    </section>
  );
}

function SurfaceCardHeader({ eyebrow }: { eyebrow: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 20,
      }}
    >
      <span className="w6-eyebrow">{eyebrow}</span>
    </div>
  );
}

/* ============================================================ */
/* Made for everyone                                             */
/* ============================================================ */

const AUDIENCES: Array<{
  id: string;
  label: string;
  title: string;
  body: string;
  href: string;
}> = [
  {
    id: "consumer",
    label: "Consumer",
    title: "Pay & receive",
    body: "Send by handle, link, QR, or screenshot. Get sealed receipts.",
    href: "/dashboard",
  },
  {
    id: "agent",
    label: "Agent",
    title: "Programmable spend",
    body: "AgentCards with caps + allowlists. Templates and a hire-Blink.",
    href: "/agents",
  },
  {
    id: "merchant",
    label: "Merchant",
    title: "Get paid",
    body: "Public profile, capabilities, DNS verify, webhooks, disputes.",
    href: "/docs",
  },
  {
    id: "developer",
    label: "Developer",
    title: "Build on Settle",
    body: "Pay / Verify / Webhooks / API. SDKs, MCP, embed components.",
    href: "/docs",
  },
  {
    id: "operator",
    label: "Operator",
    title: "Run a deploy",
    body: "Health, federation, cron, preflight, verifiable build.",
    href: "/control-center",
  },
  {
    id: "public",
    label: "Public",
    title: "Verify · stats",
    body: "Walletless verifier, capability heatmap, network stats, public feed.",
    href: "/verify",
  },
];

function MadeForEveryone() {
  return (
    <section
      className="w6-section"
      style={{ padding: "40px 32px", maxWidth: 1280, margin: "0 auto" }}
    >
      <div style={{ marginBottom: 32 }}>
        <span className="w6-eyebrow">Made for everyone in the loop</span>
        <h2
          className="w6-heading"
          style={{
            fontSize: 36,
            margin: "12px 0 0",
            lineHeight: 1.15,
            maxWidth: 780,
          }}
        >
          Six audiences. One settlement layer. Every interaction yields a
          receipt anyone can verify.
        </h2>
      </div>
      <div className="w6-grid-3" style={{ gap: 16 }}>
        {AUDIENCES.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            className="w6-card w6-card-hover"
            style={{
              padding: 24,
              minHeight: 200,
              display: "flex",
              flexDirection: "column",
              cursor: "pointer",
            }}
          >
            <span className="w6-eyebrow" style={{ marginBottom: 14 }}>
              {a.label}
            </span>
            <h3
              className="w6-heading"
              style={{ fontSize: 20, margin: 0, lineHeight: 1.2 }}
            >
              {a.title}
            </h3>
            <p
              className="w6-muted"
              style={{ fontSize: 13, lineHeight: 1.55, marginTop: 8 }}
            >
              {a.body}
            </p>
            <div style={{ flex: 1 }} />
            <div
              className="w6-eyebrow"
              style={{ marginTop: 14, color: "var(--w6-ink)" }}
            >
              Open surface →
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ============================================================ */
/* For builders                                                  */
/* ============================================================ */

function ForBuilders() {
  return (
    <section
      className="w6-section"
      style={{ padding: "40px 32px", maxWidth: 1280, margin: "0 auto" }}
    >
      <div className="w6-strip">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "0.9fr 1.1fr",
            gap: 48,
            alignItems: "center",
          }}
          className="w6-builders-grid"
        >
          <div>
            <span
              className="w6-eyebrow"
              style={{ color: "rgba(255,255,255,0.55)" }}
            >
              For builders
            </span>
            <h2
              className="w6-heading"
              style={{
                fontSize: 30,
                margin: "12px 0 0",
                lineHeight: 1.25,
                color: "#fff",
              }}
            >
              Built for agents, merchants, creators, and teams that need money
              rules to be readable.
            </h2>
            <p
              style={{
                fontSize: 14.5,
                color: "rgba(255,255,255,0.65)",
                lineHeight: 1.6,
                marginTop: 22,
                maxWidth: 460,
              }}
            >
              Integrate programmable payments without making users decode
              wallets, signatures, or raw transaction logs.
            </p>
            <div
              style={{ display: "flex", gap: 10, marginTop: 28, flexWrap: "wrap" }}
            >
              <Link href="/dashboard?demo=1" className="w6-btn w6-btn-onstrip">
                Open product preview →
              </Link>
              <Link href="/docs" className="w6-btn w6-btn-onstrip-ghost">
                Read the docs
              </Link>
            </div>
          </div>
          <div
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 18,
              padding: 22,
            }}
          >
            <div
              style={{
                marginBottom: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "rgba(255,255,255,0.5)",
                fontSize: 12,
              }}
              className="w6-mono"
            >
              <span>settle-protocol-sdk</span>
              <span style={{ flex: 1 }} />
              <span
                style={{
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: 999,
                  padding: "2px 8px",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                v0.2.0
              </span>
            </div>
            <pre
              className="w6-mono"
              style={{
                margin: 0,
                fontSize: 13,
                lineHeight: 1.75,
                color: "#fff",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {"const receipt = await "}
              <span style={{ color: "#86efac" }}>settle.pay</span>
              {"({\n  pact: "}
              <span style={{ color: "#fbbf24" }}>&quot;delivery-escrow&quot;</span>
              {",\n  rule: "}
              <span style={{ color: "#fbbf24" }}>
                &quot;release_after_approval&quot;
              </span>
              {",\n  privacy: "}
              <span style={{ color: "#fbbf24" }}>
                &quot;public proof, private memo&quot;
              </span>
              {"\n})"}
            </pre>
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 880px) {
          .w6-builders-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </section>
  );
}

/* ============================================================ */
/* Trust layer                                                   */
/* ============================================================ */

function TrustLayer() {
  const quotes: Array<{ body: string; source: string }> = [
    {
      body: "Refund available for 3 days, then funds release automatically unless disputed.",
      source: "Pact · DeliveryEscrow",
    },
    {
      body: "This agent can only pay approved APIs and cannot exceed $85 per call.",
      source: "AgentCard · Allowlist",
    },
    {
      body: "This denied spend is proof that the policy protected your balance.",
      source: "Rule · Daily cap exceeded",
    },
  ];
  return (
    <section
      className="w6-section"
      style={{ padding: "40px 32px", maxWidth: 1280, margin: "0 auto" }}
    >
      <div style={{ marginBottom: 28 }}>
        <span className="w6-eyebrow">Trust layer</span>
        <h2
          className="w6-heading"
          style={{
            fontSize: 30,
            margin: "12px 0 0",
            lineHeight: 1.2,
            maxWidth: 720,
          }}
        >
          Every rule translates into a user-facing explanation.
        </h2>
      </div>
      <div className="w6-grid-3">
        {quotes.map((q) => (
          <W6BentoCard key={q.source} hover>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.45,
                margin: 0,
                fontWeight: 500,
              }}
            >
              {q.body}
            </p>
            <div style={{ flex: 1 }} />
            <div
              className="w6-eyebrow"
              style={{ marginTop: 24, height: 22 }}
            >
              {q.source}
            </div>
          </W6BentoCard>
        ))}
      </div>
    </section>
  );
}

/* ============================================================ */
/* Final CTA                                                     */
/* ============================================================ */

function FinalCTA() {
  return (
    <section
      className="w6-section"
      style={{ padding: "40px 32px", maxWidth: 1280, margin: "0 auto" }}
    >
      <W6BentoCard style={{ padding: 48 }}>
        <div
          style={{ display: "flex", gap: 32, flexWrap: "wrap", alignItems: "center" }}
        >
          <div style={{ flex: 1, minWidth: 320 }}>
            <span className="w6-eyebrow">Start building on Settle</span>
            <h2
              className="w6-heading"
              style={{ fontSize: 36, margin: "12px 0 0", lineHeight: 1.1 }}
            >
              Request access.
            </h2>
          </div>
          <div style={{ minWidth: 380, flex: 1 }}>
            <LandingWaitlistForm source="landing" />
          </div>
        </div>
      </W6BentoCard>
    </section>
  );
}

/* ============================================================ */
/* Footer                                                        */
/* ============================================================ */

function FooterMarketing() {
  return (
    <footer style={{ borderTop: "1px solid var(--w6-rule)", padding: 32 }}>
      <div
        className="w6-section"
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <W6Logo size={22} />
        <div style={{ flex: 1 }} />
        <span className="w6-muted" style={{ fontSize: 12.5 }}>
          © 2026 Settle Labs · Built on Solana
        </span>
        <Link href="/docs" className="w6-muted" style={{ fontSize: 12.5 }}>
          Docs
        </Link>
        <Link href="/docs" className="w6-muted" style={{ fontSize: 12.5 }}>
          API
        </Link>
        <Link href="/verify" className="w6-muted" style={{ fontSize: 12.5 }}>
          Verify
        </Link>
        <Link href="/stats" className="w6-muted" style={{ fontSize: 12.5 }}>
          Stats
        </Link>
        <Link href="/brand" className="w6-muted" style={{ fontSize: 12.5 }}>
          Brand
        </Link>
        <Link href="/privacy" className="w6-muted" style={{ fontSize: 12.5 }}>
          Privacy
        </Link>
        <Link href="/terms" className="w6-muted" style={{ fontSize: 12.5 }}>
          Terms
        </Link>
      </div>
    </footer>
  );
}
