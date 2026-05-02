import type { Metadata } from "next";
import Link from "next/link";
import { W6AppShell } from "../../../components/w6-app-shell";

export const metadata: Metadata = {
  title: "Webhooks + Idempotency — Settle",
  description:
    "Stripe-shaped webhook event vocabulary, signature verification, and idempotency-key contract.",
};

/**
 * F5.6 + F5.9 docs page.
 */
export default function WebhooksDocsPage() {
  return (
    <W6AppShell forceSurface="developer">
      <div style={{ maxWidth: 880 }}>
        <div className="text-xs text-foreground/40">Phase 2 · Settle Protocol</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Webhooks + Idempotency
        </h1>
        <p className="mt-2 text-sm text-foreground/60 max-w-xl">
          Stripe-shaped event envelope, HMAC-SHA256 signatures, and
          per-key idempotency on every payment endpoint. Drop into any
          webhook-shaped backend with no Settle-specific glue.
        </p>

        <Section title="Event vocabulary (settle.v1)">
          <p>
            Each delivery has an <code>event_type</code> in the body and the
            <code className="ml-1">X-Settle-Event-Type</code> header.
          </p>
          <table className="mt-4 w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-foreground/10 text-left text-xs uppercase tracking-wide text-foreground/50">
                <th className="py-2">event_type</th>
                <th>fires when</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              <Row name="receipt.allowed" desc="Any successful payment receipt (kind: x402_spend, direct_send, link_send, streaming_claim, escrow_release)." />
              <Row name="receipt.denied" desc="On-chain DENY — policy rejected the spend before settlement." />
              <Row name="receipt.refunded" desc="Receipt of kind=refund. References the original via refund_of_request_id (in DB; surfaced in webhook in v2)." />
              <Row name="pact.disputed" desc="Delivery escrow disputed by the buyer; vault refunds." />
            </tbody>
          </table>
          <p className="mt-3 text-xs text-foreground/50">
            Receipts of every kind also appear in the payload&apos;s{" "}
            <code>data.kind</code>, so consumers who want fine-grained filtering
            can branch on that without us inventing N more event types.
          </p>
        </Section>

        <Section title="Envelope shape">
          <pre className="overflow-x-auto rounded-xl bg-black/30 p-4 text-xs text-foreground/80">
            <code>{`{
  "api_version": "settle.v1",
  "id": "evt_<request_id>",
  "event_type": "receipt.allowed",
  "created": 1714521600,
  "data": {
    "object": "receipt",
    "request_id": "uuid",
    "kind": "direct_send",
    "card_pubkey": "...",
    "pact_pubkey": null,
    "merchant_pubkey": "...",
    "amount_lamports": "500000",
    "decision": "ALLOW",
    "hashes": {
      "receipt_hash": "abc...",
      "reason_hash": "...",
      "policy_snapshot_hash": "..."
    },
    "sig_solscan": "...",
    "created_at": "2026-05-01T19:00:00Z"
  }
}`}</code>
          </pre>
        </Section>

        <Section title="Headers we send">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            <li>
              <code>X-Settle-Signature</code> — HMAC-SHA256 over the raw body
              using your shared secret.
            </li>
            <li>
              <code>X-Settle-Request-Id</code> — the receipt&apos;s request_id
              (UUID v4). Use as your own idempotency key when forwarding.
            </li>
            <li>
              <code>X-Settle-Event-Type</code> — same as <code>data.event_type</code>;
              lets you route without parsing.
            </li>
            <li>
              <code>X-Settle-Api-Version</code> — pinned to{" "}
              <code>settle.v1</code> for now.
            </li>
          </ul>
        </Section>

        <Section title="Verifying the signature">
          <pre className="overflow-x-auto rounded-xl bg-black/30 p-4 text-xs text-foreground/80">
            <code>{`import crypto from "node:crypto";

function verify(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  // constant-time compare
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(signatureHeader, "hex"),
  );
}`}</code>
          </pre>
          <p className="mt-3 text-xs text-foreground/50">
            Always verify against the RAW body bytes — re-serializing JSON can
            change whitespace and break the comparison.
          </p>
        </Section>

        <Section title="Idempotency-Key (Stripe convention)">
          <p>
            Every payment endpoint accepts an optional{" "}
            <code>Idempotency-Key</code> header. Replays of the same key within
            24 hours return the cached response with{" "}
            <code>X-Idempotent-Replay: 1</code>.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            <li>
              <code>POST /api/send/build</code>
            </li>
            <li>
              <code>POST /api/send/link/build</code>
            </li>
            <li>
              <code>POST /api/escrows/[id]/release</code>
            </li>
            <li>
              <code>POST /api/escrows/[id]/dispute</code>
            </li>
            <li>
              <code>POST /api/receipts/[id]/refund</code>
            </li>
          </ul>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-black/30 p-4 text-xs text-foreground/80">
            <code>{`fetch("/api/send/build", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({ from, to, amount }),
});`}</code>
          </pre>
          <p className="mt-3 text-xs text-foreground/50">
            Key constraints: 1–200 chars of <code>[A-Za-z0-9_-:.]</code>. Same
            key + different request body = same response (the response is
            cached, not re-derived). Old keys auto-purge after 24h.
          </p>
        </Section>

        <Section title="Retries + delivery semantics">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>
              We retry up to <b>5 times</b> with exponential backoff before
              marking <code>webhook_delivery_status = failed</code>.
            </li>
            <li>
              Any 2xx is success. 4xx + 5xx both retry — set up the receiving
              endpoint to be idempotent on <code>X-Settle-Request-Id</code>.
            </li>
            <li>
              Out-of-order delivery is possible during retries. Handle event
              ordering by <code>data.request_id</code> + on-chain <code>sig_solscan</code>.
            </li>
          </ul>
        </Section>

        <div className="mt-12 flex gap-3">
          <Link
            href="/docs"
            className="inline-flex h-10 items-center rounded-full border border-foreground/20 px-5 text-xs hover:bg-foreground/5"
          >
            ← Docs
          </Link>
          <Link
            href="/docs/verify-component"
            className="inline-flex h-10 items-center rounded-full border border-foreground/20 px-5 text-xs hover:bg-foreground/5"
          >
            &lt;settle-verify&gt; →
          </Link>
        </div>
      </div>
    </W6AppShell>
  );
}

function Row({ name, desc }: { name: string; desc: string }) {
  return (
    <tr className="border-b border-foreground/5">
      <td className="py-2 font-mono text-foreground/85">{name}</td>
      <td className="text-foreground/60">{desc}</td>
    </tr>
  );
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-medium tracking-tight">{props.title}</h2>
      <div className="prose prose-invert mt-4 max-w-none text-sm text-foreground/75 leading-relaxed">
        {props.children}
      </div>
    </section>
  );
}
