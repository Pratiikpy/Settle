import Link from "next/link";

export const metadata = {
  title: "Privacy · Settle",
  description: "What we collect, what we don't, what we'd never.",
};

/**
 * /privacy — Wave 6.1
 *
 * Plain-English privacy summary. Not a legal contract — supplements
 * any future formal policy. Updated 2026-05-02.
 *
 * Required for npm/PyPI publish trust + production traffic.
 */

export default function PrivacyPage() {
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
          Privacy
        </h1>
        <p className="w6-muted" style={{ fontSize: 16, marginBottom: 40 }}>
          What we collect, what we don&apos;t, what we&apos;d never.
        </p>

        <div
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: "var(--w6-ink-2)",
          }}
        >
          <p style={{ marginBottom: 24 }}>
            Last updated: <strong>2026-05-02</strong>. Settle is on devnet today.
            This page covers the live product as it exists now and what we
            commit to when mainnet ships.
          </p>

          <h2 className="w6-heading" style={{ fontSize: 22, marginTop: 32, marginBottom: 12 }}>
            What we collect
          </h2>
          <ul style={{ margin: "0 0 24px 24px", padding: 0 }}>
            <li>
              <strong>Wallet address</strong> when you connect Phantom or another
              Solana wallet. Public and on-chain by definition.
            </li>
            <li>
              <strong>Email</strong> only if you submit it via the waitlist or
              merchant onboarding. Stored in our database, accessible only to
              service-role credentials we control.
            </li>
            <li>
              <strong>Receipts</strong> you generate by sending or receiving.
              Public on-chain. We store an indexed copy in our database for
              fast UI rendering.
            </li>
            <li>
              <strong>Anonymous usage signals</strong> (Sentry crash reports,
              high-level page views). No third-party advertising trackers,
              ever.
            </li>
          </ul>

          <h2 className="w6-heading" style={{ fontSize: 22, marginTop: 32, marginBottom: 12 }}>
            What we don&apos;t collect
          </h2>
          <ul style={{ margin: "0 0 24px 24px", padding: 0 }}>
            <li>Private keys. Settle never sees, stores, or transmits them.</li>
            <li>
              Transaction signing happens entirely in your wallet adapter. We
              receive only the signed transaction or signature.
            </li>
            <li>
              We don&apos;t use Google Analytics, Facebook Pixel, or any
              ad-network tracker.
            </li>
          </ul>

          <h2 className="w6-heading" style={{ fontSize: 22, marginTop: 32, marginBottom: 12 }}>
            What we&apos;d never do
          </h2>
          <ul style={{ margin: "0 0 24px 24px", padding: 0 }}>
            <li>
              Sell or rent your email, wallet, or activity to advertisers. Not
              now, not ever, full stop.
            </li>
            <li>
              Read or decrypt sealed memos. Memos use libsodium sealed-box; we
              don&apos;t hold the recipient&apos;s decryption key.
            </li>
            <li>
              Touch funds in your wallet without your explicit signature.
            </li>
          </ul>

          <h2 className="w6-heading" style={{ fontSize: 22, marginTop: 32, marginBottom: 12 }}>
            Where data lives
          </h2>
          <p style={{ marginBottom: 24 }}>
            Database: Supabase (Postgres) hosted in the US. Solana receipts:
            on-chain (devnet today, mainnet at audit completion). Email errors:
            Sentry. No data leaves these three systems unless we explicitly
            integrate a new one and document it here.
          </p>

          <h2 className="w6-heading" style={{ fontSize: 22, marginTop: 32, marginBottom: 12 }}>
            Your rights
          </h2>
          <p style={{ marginBottom: 24 }}>
            Email <strong>privacy@settle.so</strong> to request a copy of your
            data, deletion of your waitlist entry, or anything else. We respond
            within 30 days.
          </p>

          <p className="w6-muted" style={{ fontSize: 13 }}>
            This page is a faithful summary, not a legal contract. A formal
            privacy policy ships before mainnet.
          </p>
        </div>
      </main>
    </div>
  );
}
