import Link from "next/link";
import { SettleCard } from "@settle/ui";
import { Footer } from "../components/footer";

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="relative px-6 py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <h1 className="text-balance text-display-2 font-semibold">
              Pay anyone.
              <br />
              Hire any AI.
              <br />
              <span className="text-gradient">Trust the receipts.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg text-foreground/70">
              The payment app for the AI age. On Solana. Send anyone money. Hire AI agents to
              spend on your behalf with cryptographically scoped permissions.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/onboarding"
                className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-8 text-sm font-medium text-background transition hover:opacity-90"
              >
                Get started in 60 seconds
              </Link>
              <Link
                href="/agents"
                className="inline-flex h-12 items-center justify-center rounded-full border border-foreground/20 px-8 text-sm font-medium transition hover:bg-foreground/5"
              >
                Hire an AI agent →
              </Link>
            </div>
            <p className="mt-6 text-xs text-foreground/40">
              Phantom required · Devnet today · Mainnet after audit
            </p>
          </div>

          <div className="relative">
            <div className="absolute -inset-12 -z-10 rounded-full bg-purple-gradient opacity-20 blur-3xl" />
            <div className="space-y-4">
              <SettleCard
                handle="@pratiik"
                balance="$25.00"
                symbol="USDC"
                subline="Devnet · Phantom"
                variant="main"
              />
              <SettleCard
                handle="@pratiik"
                balance="$0.45 / $0.50"
                symbol="Pact · Research"
                subline="Expires in 12:43"
                variant="pact"
                size="compact"
              />
            </div>
          </div>
        </div>
      </section>

      {/* What you can do */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl font-semibold tracking-tight">What you can do</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {WHAT_YOU_CAN_DO.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-2xl border border-foreground/10 bg-white/[0.01] p-6 transition hover:border-foreground/30 hover:bg-foreground/5"
            >
              <div className="text-xs font-medium uppercase tracking-wider text-accent">{item.tag}</div>
              <h3 className="mt-2 text-xl font-medium">{item.title}</h3>
              <p className="mt-3 text-sm text-foreground/60">{item.desc}</p>
              <div className="mt-6 text-sm text-foreground/40 transition group-hover:text-accent">
                {item.cta} →
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Solana primitives strip */}
      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-2xl border border-foreground/10 bg-white/[0.01] p-8">
          <h3 className="text-sm font-medium uppercase tracking-wider text-foreground/60">
            Built with the full Solana stack
          </h3>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-foreground/70">
            {SOLANA_PRIMITIVES.map((p) => (
              <span key={p}>{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </main>
  );
}

const WHAT_YOU_CAN_DO = [
  {
    tag: "01 · Send",
    title: "Send money to anyone",
    desc: "Type @elena, $10, ‘thanks for dinner’ — done. Solana Pay reference attached. Sub-second confirmation.",
    cta: "Try send",
    href: "/send",
  },
  {
    tag: "02 · Hire",
    title: "Hire an AI agent",
    desc: "Spawn a single-task Pact card with a hard cap, allowlist, expiry, and one-tap revoke.",
    cta: "Hire an agent",
    href: "/agents",
  },
  {
    tag: "03 · Watch",
    title: "Watch agent work live",
    desc: "Live activity feed shows every x402 payment in real time. Countdown ring depletes. Deliverable lands.",
    cta: "See live feed",
    href: "/activity",
  },
  {
    tag: "04 · Trust",
    title: "Verify on-chain",
    desc: "Every receipt commits 3 BLAKE3 hashes. Anyone can verify with @settle/sdk verifyReceipt.",
    cta: "View cards",
    href: "/cards",
  },
  {
    tag: "05 · Share",
    title: "Share as a Solana Blink",
    desc: "One-tap shareable link. Friends click → Phantom opens → spawn the same agent for their own task.",
    cta: "See an example",
    href: "/blink/research",
  },
  {
    tag: "06 · Earn",
    title: "Be a merchant",
    desc: "Generate Solana Pay QR or transaction-request URL. Customer scans. cNFT loyalty receipt minted.",
    cta: "Generate request",
    href: "/request",
  },
];

// What's actually wired in v0.2 (devnet). Items still pending real wiring (Jupiter swap UI,
// Solana Mobile MWA adapter, Privy hooks, MPL-Bubblegum V2 migration) deliberately omitted —
// no marketing claims for code that isn't there yet.
const SOLANA_PRIMITIVES = [
  "Anchor 0.31",
  "SPL Token (TransferChecked)",
  "Solana Pay (reference)",
  "Bubblegum V1 cNFTs",
  "Squads V4 detection",
  "Pyth Hermes",
  "Helius RPC + Sender",
  "Lighthouse asserts (opt-in)",
  "Jito Bundles (mainnet)",
  "Solana Attestation Service",
  "Bonfida SNS",
  "Phantom adapter",
  "Solana Actions / Blinks",
];
