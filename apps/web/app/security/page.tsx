import type { Metadata } from "next";
import Link from "next/link";
import { W6AppShell } from "../../components/w6-app-shell";

export const metadata: Metadata = {
  title: "Security — Settle",
  description: "Settle's security model: dual signatures, hash chain, deny codes, replay protection.",
};

export default function SecurityPage() {
  return (
    <W6AppShell forceSurface="public">
      <div style={{ maxWidth: 760 }}>
        <div style={{ marginBottom: 32 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Security
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Threat model and defenses.
          </h1>
          <p
            className="w6-muted"
            style={{
              fontSize: 14,
              marginTop: 8,
              maxWidth: 640,
              lineHeight: 1.5,
            }}
          >
            We assume the agent runtime, the merchant, and the network are
            all untrusted. The user&rsquo;s private key and the Anchor
            program are the only trust roots.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 32,
            fontSize: 14,
            lineHeight: 1.6,
            color: "var(--w6-ink-2)",
          }}
        >
          <Section title="Dual signature">
            Every agent request carries two signatures:{" "}
            <strong>authority_sig</strong> over the canonical credential envelope (proves the user
            authorized this agent at all), plus <strong>agent_sig</strong> over each request line{" "}
            <code>METHOD\nPATH\nsha256(body)\nts\nnonce</code> (proves the request wasn&apos;t tampered
            in flight). The proxy verifies both before authorizing a spend.
          </Section>

          <Section title="On-chain enforcement">
            The Anchor program rechecks every policy invariant atomically inside{" "}
            <code>spend</code>, <code>spend_via_pact</code>, and <code>claim_streaming</code>:
            revoked? expired? merchant in allowlist? capability pinned? amount over per-call
            max? amount over remaining daily cap (cross-pact via parent card)? mint correct?
            The off-chain proxy could be malicious — the program is the final gate.
          </Section>

          <Section title="DeliveryEscrow merchant pin (P9)">
            For <code>open_delivery_escrow</code>, the merchant pubkey is pinned in the Pact
            variant payload. <code>release_delivery_escrow</code> rejects any{" "}
            <code>merchant_usdc</code> account whose <code>owner</code> field doesn&apos;t equal
            the pinned merchant. That&apos;s what makes permissionless release after the deadline
            safe — a stranger calling release cannot redirect funds. Worst case, they pay the
            tx fee to settle a payment that was already destined for the merchant.
          </Section>

          <Section title="Streaming pact slot accounting">
            Pause windows are tracked via <code>pause_started_slot</code> +{" "}
            <code>pause_accumulated_slots</code>. On a successful claim, accumulated resets to{" "}
            zero AND <code>pause_started_slot ← now_slot</code> if still paused — so subsequent
            paused time accrues fresh, never retro-charges the just-claimed period. Per-slot
            entitlement is bounded by <code>max_total − claimed</code> via{" "}
            <code>checked_mul</code> + <code>min</code>; overflow returns{" "}
            <code>PactOverCap</code> deterministically.
          </Section>

          <Section title="Hash chain">
            Every spend commits four BLAKE3 hashes:
            <ul className="mt-2 ml-6 list-disc space-y-1">
              <li><code>receipt_hash</code> — request_id, card, merchant, amount, capability, purpose_text_hash, slot, policy_version</li>
              <li><code>reason_hash</code> — decision, deny_code, cap remaining, allowlist match, capability pinned, expiry slot</li>
              <li><code>policy_snapshot_hash</code> — version, caps, allowlist count, expiry, revoked flag</li>
              <li><code>purpose_hash</code> — meta-commitment binding the previous three to HTTP context</li>
            </ul>
            <p className="mt-3">
              An auditor with the off-chain data recomputes all four and compares. A single byte
              of tamper invalidates the chain.
            </p>
          </Section>

          <Section title="Replay protection">
            Each request includes a 16-byte nonce. The proxy stores nonces in Upstash with a
            5-minute TTL plus a Postgres backup for forensics. Reuse → 409 Conflict. Timestamp
            skew of more than ±5 minutes → 401.
          </Section>

          <Section title="Loop guard">
            Three same-merchant attempts within 60 seconds → deny code 6 (DuplicateOrLoopDetected).
            Stops a runaway agent from draining a Pact in a tight loop on a single merchant.
          </Section>

          <Section title="Merchant verification">
            Merchants attest their pubkey via the Solana Attestation Service. Unattested merchants
            are rejected with deny code 8 (MerchantNotVerified). Devnet allows seeded merchants for
            sandbox testing.
          </Section>

          <Section title="Submission path: Helius Sender + Jito bundle">
            Every proxy-mediated spend (<code>spend_via_pact</code>,{" "}
            <code>claim_streaming</code>) is posted via{" "}
            <a
              href="https://www.helius.dev/docs/sender"
              className="text-accent underline-offset-2 hover:underline"
              target="_blank"
              rel="noreferrer"
            >
              Helius Sender
            </a>{" "}
            as a Jito bundle. The tx carries a Compute-Budget priority-fee instruction
            and a small Jito tip baked in by{" "}
            <code>addPriorityFeeAndTip</code> before signing. Sender lands the tx on
            the first try without retry loops, typical confirmation under 0.4 s on
            mainnet. Receipts surface this via a{" "}
            <strong>Helius Sender · Jito bundle</strong> badge so the user can verify
            the submission strategy used. Falls back to vanilla{" "}
            <code>sendRawTransaction</code> when <code>HELIUS_API_KEY</code> isn&apos;t
            configured — the badge degrades honestly to{" "}
            <strong>RPC sendRawTransaction (Sender unavailable)</strong>.
          </Section>

          <Section title="Off-chain encryption">
            Off-chain receipt metadata (purpose text, deliverable summary) is encrypted with a
            sealed box (X25519 + XChaCha20-Poly1305) to a per-deployment public key. Even with
            full Supabase access, an attacker without the matching private key cannot read it.
            Push notifications use end-to-end aes128gcm + ECDH per RFC 8291.
          </Section>

          <Section title="Wallet-signed reads">
            Sensitive endpoints (decrypt, claim handle, push subscribe, template create) require
            Ed25519 signatures over a canonical challenge with a one-time nonce. The server
            verifies the signature against the on-chain authority pubkey before responding.
          </Section>

          <Section title="What we don&apos;t claim">
            Settle is hackathon-grade software, not Stripe-grade. The Anchor program hasn&apos;t been
            externally audited. The proxy has been designed for safety but not pen-tested. Treat
            devnet caps as illustrative — production deployments should bound them tightly.
          </Section>
        </div>

        <p
          className="w6-muted"
          style={{ marginTop: 32, fontSize: 12 }}
        >
          Found something? Open an issue or DM us. See also{" "}
          <Link href="/docs" style={{ color: "var(--w6-ink)" }}>
            docs
          </Link>{" "}
          and{" "}
          <Link href="/public-goods" style={{ color: "var(--w6-ink)" }}>
            public goods
          </Link>
          .
        </p>
      </div>
    </W6AppShell>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="w6-card" style={{ padding: 24 }}>
      <h2
        className="w6-heading"
        style={{
          fontSize: 16,
          margin: 0,
          marginBottom: 12,
          color: "var(--w6-ink)",
        }}
      >
        {title}
      </h2>
      <div style={{ color: "var(--w6-ink-2)" }}>{children}</div>
    </section>
  );
}
