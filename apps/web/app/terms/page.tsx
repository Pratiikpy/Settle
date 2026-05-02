import Link from "next/link";

export const metadata = {
  title: "Terms · Settle",
  description: "How Settle works, plainly.",
};

/**
 * /terms — Wave 6.1
 *
 * Plain-English terms. Not a substitute for a formal ToS. Reviewed
 * 2026-05-02.
 */

export default function TermsPage() {
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
          Terms
        </h1>
        <p className="w6-muted" style={{ fontSize: 16, marginBottom: 40 }}>
          How Settle works, plainly.
        </p>

        <div
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: "var(--w6-ink-2)",
          }}
        >
          <p style={{ marginBottom: 24 }}>
            Last updated: <strong>2026-05-02</strong>. Settle is on devnet
            today. This page covers what you can and can&apos;t expect from
            the service in its current form.
          </p>

          <h2 className="w6-heading" style={{ fontSize: 22, marginTop: 32, marginBottom: 12 }}>
            What Settle is
          </h2>
          <p style={{ marginBottom: 24 }}>
            A self-custody payment app on Solana. You connect your wallet, you
            sign every payment, the on-chain Anchor program records the
            receipt. We don&apos;t hold funds. We don&apos;t move money for
            you.
          </p>

          <h2 className="w6-heading" style={{ fontSize: 22, marginTop: 32, marginBottom: 12 }}>
            What you can do with it
          </h2>
          <ul style={{ margin: "0 0 24px 24px", padding: 0 }}>
            <li>Send and receive payments by handle, link, QR, or pubkey.</li>
            <li>Hire AI agents with bounded spending caps.</li>
            <li>Open Pacts (OneShot, Streaming, DeliveryEscrow).</li>
            <li>Verify any receipt cryptographically using @settle/sdk.</li>
            <li>Embed payment + verification components on your site.</li>
          </ul>

          <h2 className="w6-heading" style={{ fontSize: 22, marginTop: 32, marginBottom: 12 }}>
            What you can&apos;t use it for
          </h2>
          <ul style={{ margin: "0 0 24px 24px", padding: 0 }}>
            <li>Money laundering, terrorism financing, sanctions evasion.</li>
            <li>Fraud, theft, or any payment that would be illegal in your jurisdiction.</li>
            <li>
              Reselling Settle as your own product without attribution. The
              code is MIT-licensed; that license still requires the notice.
            </li>
          </ul>

          <h2 className="w6-heading" style={{ fontSize: 22, marginTop: 32, marginBottom: 12 }}>
            Service availability
          </h2>
          <p style={{ marginBottom: 24 }}>
            Devnet is best-effort. We deploy multiple times per week. We may
            wipe state during testing. Don&apos;t use devnet for anything that
            matters financially — devnet SOL has no value.
          </p>
          <p style={{ marginBottom: 24 }}>
            Mainnet ships after a third-party Anchor audit. Until then,
            don&apos;t move real money through Settle.
          </p>

          <h2 className="w6-heading" style={{ fontSize: 22, marginTop: 32, marginBottom: 12 }}>
            No warranty
          </h2>
          <p style={{ marginBottom: 24 }}>
            Settle is provided &quot;as is&quot; without warranty of any kind.
            We&apos;re building in public; bugs ship. We work hard to fix them
            fast, but we can&apos;t promise zero downtime or zero defects.
          </p>

          <h2 className="w6-heading" style={{ fontSize: 22, marginTop: 32, marginBottom: 12 }}>
            Changes
          </h2>
          <p style={{ marginBottom: 24 }}>
            When these terms change, the &quot;Last updated&quot; date above
            changes too, and we mention the change in the changelog.
          </p>

          <h2 className="w6-heading" style={{ fontSize: 22, marginTop: 32, marginBottom: 12 }}>
            Contact
          </h2>
          <p style={{ marginBottom: 24 }}>
            <strong>support@settle.so</strong> for product questions.{" "}
            <strong>privacy@settle.so</strong> for data requests.{" "}
            <strong>security@settle.so</strong> for security disclosures.
          </p>

          <p className="w6-muted" style={{ fontSize: 13 }}>
            This page is a faithful summary, not a legal contract. A formal
            terms-of-service ships before mainnet.
          </p>
        </div>
      </main>
    </div>
  );
}
