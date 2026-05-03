import type { Metadata } from "next";
import Link from "next/link";
import { W6AppShell } from "../../components/w6-app-shell";

export const metadata: Metadata = {
  title: "Docs — Settle",
  description:
    "Settle protocol developer reference: SDK install (TS/Python/Rust), kernel commit, Anchor ix data, webhooks, Phase 5 automation, embed components.",
};

/**
 * /docs — comprehensive developer reference.
 *
 * Single-page survey of every public surface the protocol exposes.
 * Designed to fit one workday of reading: a developer hitting this
 * page can install the SDK, hash a receipt, compose an Anchor ix, and
 * receive a webhook within an afternoon.
 *
 * Sections are top-down by abstraction level — install + verify first
 * (highest leverage for a first integration), Anchor ix data + Phase 5
 * automation deeper down (deeper integration territory).
 *
 * Markdown-style headings + tables. No JS interactions — pure server
 * render so search engines + AI scrapers can ingest cleanly.
 */
export default function DocsPage() {
  const navLinks: Array<{ href: string; label: string }> = [
    { href: "#install", label: "Quickstart" },
    { href: "#kernel", label: "Kernel commit" },
    { href: "#anchor", label: "Anchor ix" },
    { href: "#webhooks", label: "Webhooks" },
    { href: "#phase5", label: "Phase 5 automation" },
    { href: "#embed", label: "Embed components" },
    { href: "#graphql", label: "GraphQL" },
    { href: "#federation", label: "Federation" },
  ];

  return (
    <W6AppShell forceSurface="developer">
      <div style={{ maxWidth: 880 }}>
        {/* Hero */}
        <header style={{ marginBottom: 32 }}>
          <div className="w6-eyebrow" style={{ fontSize: 12 }}>
            Developers · Settle SDK, MCP, embeddables
          </div>
          <h1
            className="w6-heading"
            style={{ fontSize: 36, margin: "8px 0 0", lineHeight: 1.05 }}
          >
            Verifiable money on Solana.
          </h1>
          <p
            className="w6-muted"
            style={{
              fontSize: 14,
              marginTop: 8,
              maxWidth: 720,
              lineHeight: 1.5,
            }}
          >
            Every payment leaves a 4-hash on-chain commit. Anyone can
            verify it forever, in any of three languages, against on-chain
            state with no Settle dependency. This page is the protocol
            reference.
          </p>
          <nav
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 18,
            }}
          >
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                style={{
                  height: 30,
                  padding: "0 12px",
                  borderRadius: 999,
                  border: "1px solid var(--w6-rule)",
                  background: "#fff",
                  color: "var(--w6-ink-2)",
                  fontSize: 12,
                  fontWeight: 500,
                  display: "inline-flex",
                  alignItems: "center",
                  textDecoration: "none",
                }}
              >
                {l.label}
              </a>
            ))}
          </nav>
        </header>

        {/* Install */}
        <Section id="install" title="Install">
          <p className="text-sm text-[#27272a]">
            Three SDKs ship the same canonical hashing + ix-data byte
            output. Pick the one that fits your stack — or use them
            interleaved (verify in Python, compose in Rust, build the UI
            in TypeScript).
          </p>
          <div className="mt-4 grid gap-3">
            <Code lang="TypeScript">{`pnpm add @settle/sdk`}</Code>
            <Code lang="Python">{`pip install settle-sdk`}</Code>
            <Code lang="Rust">{`# Cargo.toml
[dependencies]
settle-sdk = "0.1"`}</Code>
          </div>
          <Callout tone="emerald" title="Cross-language parity locked">
            Every kernel hash and every Anchor ix data byte is asserted
            against TS-emitted goldens in both Rust + Python test suites.
            246 tests across the three languages pin the wire format.
          </Callout>
        </Section>

        {/* Kernel commit */}
        <Section id="kernel" title="Kernel commit (F2.0)">
          <p className="text-sm text-[#27272a]">
            Every Settle receipt commits to four BLAKE3-256 hashes —
            structured, sorted-keys-canonical-JSON over the receipt /
            reason / policy snapshot, plus a binding purpose hash. Any
            Settle SDK produces byte-identical output.
          </p>
          <Code lang="TypeScript">{`import { kernelCommit } from "@settle/sdk";

const out = kernelCommit({
  kind: "direct_send",
  request_id: "11111111-2222-3333-4444-555555555555",
  amount_lamports: "500000",
  sender: senderPubkey,
  recipient: recipientPubkey,
  decision_slot: currentSlot,
  purpose_text: "coffee with alice",
});

// out.hashes.receipt_hash, .reason_hash, .policy_snapshot_hash, .purpose_hash
// out.context_hash — indexable identity, BLAKE3 over { kind, sender, recipient, amount, request_id }`}</Code>

          <p className="mt-4 text-sm text-[#27272a]">
            Seven receipt kinds, each with its own canonical schema:
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-[#e4e4e7]">
            <table className="w-full text-xs">
              <thead className="bg-[#fafafa]">
                <tr className="text-left text-[#52525b]">
                  <th className="px-3 py-2">Kind</th>
                  <th className="px-3 py-2">Use</th>
                  <th className="px-3 py-2">Card-bound</th>
                </tr>
              </thead>
              <tbody className="text-[#27272a]">
                <KindRow kind="x402_spend" use="Agent task spend via x402-style HTTP" cardBound />
                <KindRow kind="direct_send" use="User-signed wallet → wallet transfer" cardBound={false} />
                <KindRow kind="link_send" use="Pre-funded payment link claim" cardBound={false} />
                <KindRow kind="streaming_claim" use="Agent draws from streaming Pact" cardBound />
                <KindRow kind="escrow_release" use="Delivery escrow released to merchant" cardBound />
                <KindRow kind="escrow_dispute" use="Delivery escrow refunded to buyer" cardBound />
                <KindRow kind="refund" use="Post-receipt refund of any kind" cardBound={false} />
              </tbody>
            </table>
          </div>
        </Section>

        {/* Capability hash */}
        <Section id="capability" title="Capability hash">
          <p className="text-sm text-[#27272a]">
            32-byte BLAKE3 over <code>(domain, method, path, amount_lamports,
            version)</code>. Pin this in a card&apos;s allowlist to lock the
            agent to one specific tool spec at one specific price.
          </p>
          <Code lang="Python">{`from settle_sdk import compute_capability_hash_hex

cap = compute_capability_hash_hex({
    "domain": "translate.example.com",
    "method": "POST",
    "path": "/v1/translate",
    "amount_lamports": "20000",
    "version": 1,
})
# = "a6c909df4e32976e67abd01927fea3796ec0170b8c1e0f1c708139da7964105b"`}</Code>
        </Section>

        {/* Anchor ix data */}
        <Section id="anchor" title="Anchor instruction data builders">
          <p className="text-sm text-[#27272a]">
            All 13 program instructions have byte-parity builders in TS,
            Rust, and Python. Builders return raw <code>bytes</code> that
            you wrap in your preferred Solana client&apos;s
            <code>Instruction</code> type (solana-sdk, anchor-client,
            solders, etc).
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-[#e4e4e7]">
            <table className="w-full text-xs">
              <thead className="bg-[#fafafa]">
                <tr className="text-left text-[#52525b]">
                  <th className="px-3 py-2">Instruction</th>
                  <th className="px-3 py-2">Signer</th>
                  <th className="px-3 py-2">Body bytes</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[11px] text-[#27272a]">
                <IxRow name="create_card" signer="authority" body="agent + label_hash + caps + allowlist + expiry + version" />
                <IxRow name="spend" signer="authority" body="amount + 4 hashes" />
                <IxRow name="spend_via_pact" signer="agent" body="amount + 4 hashes (same shape as spend)" />
                <IxRow name="open_pact" signer="authority" body="scope_label + cap + allowlist + expiry" />
                <IxRow name="close_pact" signer="authority" body="(empty)" />
                <IxRow name="revoke" signer="authority" body="(empty)" />
                <IxRow name="open_streaming_pact" signer="authority" body="scope + rate + max_total + allowlist + expiry" />
                <IxRow name="claim_streaming" signer="agent" body="4 hashes" />
                <IxRow name="pause_streaming" signer="authority" body="(empty)" />
                <IxRow name="resume_streaming" signer="authority" body="(empty)" />
                <IxRow name="open_delivery_escrow" signer="authority" body="scope + amount + merchant + capability + 3 deadlines" />
                <IxRow name="release_delivery_escrow" signer="buyer or anyone post-deadline" body="(empty)" />
                <IxRow name="dispute_delivery_escrow" signer="buyer" body="(empty)" />
              </tbody>
            </table>
          </div>
          <Code lang="Rust">{`use settle_sdk::ix_data::{spend_via_pact, SpendArgs};

let data: Vec<u8> = spend_via_pact(&SpendArgs {
    amount: 500_000,
    capability_hash: [0; 32],
    receipt_hash: kernel_out.hashes.receipt_hash_bytes(),
    reason_hash: kernel_out.hashes.reason_hash_bytes(),
    policy_snapshot_hash: kernel_out.hashes.policy_snapshot_hash_bytes(),
});
// Wrap in solana_sdk::instruction::Instruction with your AccountMeta list`}</Code>
        </Section>

        {/* Webhooks */}
        <Section id="webhooks" title="Webhooks (Stripe-shaped envelope)">
          <p className="text-sm text-[#27272a]">
            Settle posts a JSON envelope to your registered webhook URL
            when a receipt is recorded for your merchant pubkey. HMAC-SHA256
            signed with your secret. Verify before trusting the body.
          </p>
          <Code lang="JSON">{`{
  "api_version": "settle.v1",
  "id": "evt_<request_id>",
  "event_type": "receipt.allowed",
  "created": 1735689600,
  "data": {
    "object": "receipt",
    "request_id": "11111111-...",
    "kind": "x402_spend",
    "card_pubkey": "...",
    "merchant_pubkey": "...",
    "amount_lamports": "20000",
    "decision": "ALLOW",
    "hashes": {
      "receipt_hash": "...",
      "reason_hash": "...",
      "policy_snapshot_hash": "..."
    },
    "sig_solscan": "<tx-signature>",
    "created_at": "..."
  }
}`}</Code>
          <p className="mt-3 text-sm text-[#27272a]">
            Event types:
            {" "}<code>receipt.allowed</code>,{" "}
            <code>receipt.denied</code>,{" "}
            <code>receipt.refunded</code>,{" "}
            <code>receipt.imported</code>,{" "}
            <code>pact.disputed</code>,{" "}
            <code>federated.imported</code>.
          </p>
          <Code lang="TypeScript">{`import { verifyWebhookSignature } from "@settle/sdk";

const sig = req.headers["x-settle-signature"];
if (!verifyWebhookSignature(req.rawBody, sig, mySharedSecret)) {
  throw new Error("untrusted webhook");
}`}</Code>
        </Section>

        {/* Phase 5 */}
        <Section id="phase5" title="Phase 5 automation">
          <p className="text-sm text-[#27272a]">
            Phase 5 is the cron-fired automation loop. Six intent kinds
            share one on-chain ix (<code>spend_via_pact</code>) under a
            user-delegated card. The relayer signs; the user&apos;s wallet
            authorizes the cap + allowlist at card-creation time.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <PhaseFeature
              name="scheduled_send"
              hook="cadence (DAILY/WEEKLY/MONTHLY)"
              ui="/wishes"
            />
            <PhaseFeature
              name="auto_refill"
              hook="balance < threshold (RPC poll)"
              ui="/spending"
            />
            <PhaseFeature
              name="round_up"
              hook="post-spend indexer event"
              ui="/wishes"
            />
            <PhaseFeature
              name="gift_claim"
              hook="recipient signs claim attestation"
              ui="/wishes (gifts tab)"
            />
            <PhaseFeature
              name="gift_refund"
              hook="expires_at elapsed"
              ui="(automatic)"
            />
            <PhaseFeature
              name="group_spend"
              hook="N-of-M off-chain quorum"
              ui="/groups"
            />
          </div>
          <Callout tone="amber" title="Live mode is opt-in">
            Default is <code>SETTLE_RELAYER_LIVE=false</code> (dry-run).
            Operators inspect <code>phase5_executions</code> audit rows
            for a few cron cycles, then flip live. Card delegation +
            Pact presence are validated upstream — misconfigured rules
            fail loud at the audit row, never silently.
          </Callout>
        </Section>

        {/* Embed */}
        <Section id="embed" title="Embed: Settle Pay button">
          <p className="text-sm text-[#27272a]">
            Drop one <code>&lt;script&gt;</code> + one
            <code>&lt;settle-pay&gt;</code> tag into any HTML page. No
            framework. Custom element handles wallet popup + receipt
            creation + confirmation.
          </p>
          <Code lang="HTML">{`<script src="https://settle.app/pay.js"></script>
<settle-pay
  merchant="<base58-pubkey>"
  amount="0.50"
  note="Coffee">
</settle-pay>

<script>
document.querySelector("settle-pay")
  .addEventListener("settle:success", (e) => console.log(e.detail));
</script>`}</Code>
          <p className="mt-3 text-sm text-[#27272a]">
            Companion <code>&lt;settle-verify request-id=&quot;&quot;&gt;</code>
            re-derives the 4-hash kernel commit client-side and shows ✓ if
            it matches the on-chain anchor. See{" "}
            <Link href="/pay" className="text-accent hover:underline">
              /pay
            </Link>{" "}
            for a live demo.
          </p>
        </Section>

        {/* GraphQL */}
        <Section id="graphql" title="GraphQL read API">
          <p className="text-sm text-[#27272a]">
            Read-only GraphQL at <code>POST /api/graphql</code> for
            shape-flexible queries over receipts, cards, handles, and
            refund requests. Writes stay REST-only (idempotency-keyed).
          </p>
          <Code lang="GraphQL">{`query Receipt($id: ID!) {
  receipt(request_id: $id) {
    request_id
    kind
    amount_lamports
    sender_pubkey
    recipient_pubkey
    decision
    created_at
  }
}`}</Code>
          <Code lang="TypeScript">{`import { createGraphqlClient } from "@settle/sdk";

const client = createGraphqlClient("https://settle.app/api/graphql");
const data = await client<{ receipt: Receipt | null }>(query, { id });`}</Code>
        </Section>

        {/* Federation */}
        <Section id="federation" title="Federation contract">
          <p className="text-sm text-[#27272a]">
            Foreign protocols (x402-style, Solana Pay bridges, etc) can
            mirror their receipts into Settle&apos;s ledger by signing a
            payload-hash attestation with their registered Ed25519 key.
            Trusted origins surface in <code>/ledger</code>; untrusted
            stay hidden until an operator promotes them.
          </p>
          <Code lang="JSON">{`POST /api/federation/import
{
  "origin_id": "x402.example",
  "remote_request_id": "<their-id>",
  "payload": { "from": "...", "to": "...", "amount_lamports": "20000" },
  "attestation_sig_b58": "<ed25519 sig over payload_hash || origin_id || remote_request_id>"
}`}</Code>
          <p className="mt-3 text-sm text-[#27272a]">
            Native Settle receipts (4-hash kernel commit) and federated
            receipts (foreign-attested) NEVER live in the same table —
            the kernel commit guarantees only apply to the native ones.
            <code>/ledger</code> shows the trust gradient explicitly.
          </p>
        </Section>

        {/* Cross-language parity */}
        <Section id="parity" title="Cross-language parity guarantees">
          <p className="text-sm text-[#27272a]">
            Every wire-format byte is asserted against TS-emitted goldens
            in two more languages. Drift between SDKs is impossible to
            ship — the test breaks first.
          </p>
          <div className="mt-3 overflow-hidden rounded-xl border border-[#e4e4e7]">
            <table className="w-full text-xs">
              <thead className="bg-[#fafafa]">
                <tr className="text-left text-[#52525b]">
                  <th className="px-3 py-2">Layer</th>
                  <th className="px-3 py-2">TS</th>
                  <th className="px-3 py-2">Python</th>
                  <th className="px-3 py-2">Rust</th>
                </tr>
              </thead>
              <tbody className="text-[#27272a]">
                <ParityRow layer="Canonical JSON + capability hash" />
                <ParityRow layer="Kernel commit (7 receipt kinds)" />
                <ParityRow layer="Anchor ix data (13 instructions)" />
              </tbody>
            </table>
          </div>
        </Section>

        {/* Source */}
        <section className="mt-16 rounded-2xl border border-[#e4e4e7] bg-[#fafafa] p-5">
          <p className="text-sm text-[#27272a]">
            Open source, MIT. Issues + PRs welcome.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="https://github.com/settle-protocol/settle"
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-[#e4e4e7] px-3 py-1.5 text-[11px] text-[#52525b] hover:bg-[#f4f4f5]"
            >
              GitHub ↗
            </a>
            <Link
              href="/docs/mcp"
              className="rounded-full border border-[#e4e4e7] px-3 py-1.5 text-[11px] text-[#52525b] hover:bg-[#f4f4f5]"
            >
              MCP middleware
            </Link>
            <Link
              href="/stats"
              className="rounded-full border border-[#e4e4e7] px-3 py-1.5 text-[11px] text-[#52525b] hover:bg-[#f4f4f5]"
            >
              Network stats
            </Link>
          </div>
        </section>
      </div>
    </W6AppShell>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      style={{ marginTop: 64, scrollMarginTop: 64, color: "var(--w6-ink-2)" }}
    >
      <h2
        className="w6-heading"
        style={{
          fontSize: 24,
          margin: 0,
          color: "var(--w6-ink)",
        }}
      >
        {title}
      </h2>
      <div
        style={{
          marginTop: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          color: "var(--w6-ink-2)",
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Code({ lang, children }: { lang: string; children: string }) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: "1px solid var(--w6-rule)",
        background: "var(--w6-bg-2)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          borderBottom: "1px solid var(--w6-rule)",
          padding: "6px 12px",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.18em",
          fontWeight: 700,
          color: "var(--w6-ink-4)",
        }}
      >
        {lang}
      </div>
      <pre
        style={{
          overflow: "auto",
          padding: 12,
          fontSize: 12,
          lineHeight: 1.55,
          margin: 0,
        }}
      >
        <code
          className="w6-mono"
          style={{ color: "var(--w6-ink)" }}
        >
          {children}
        </code>
      </pre>
    </div>
  );
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: "emerald" | "amber" | "neutral";
  title: string;
  children: React.ReactNode;
}) {
  const cls = {
    emerald: "border-emerald-400/30 bg-emerald-400/[0.04]",
    amber: "border-amber-400/30 bg-amber-400/[0.04]",
    neutral: "border-[#e4e4e7] bg-[#fafafa]",
  }[tone];
  return (
    <div className={`mt-4 rounded-xl border ${cls} p-4 text-xs`}>
      <p className="font-medium text-[#27272a]">{title}</p>
      <p className="mt-1 text-[#27272a]">{children}</p>
    </div>
  );
}

function KindRow({
  kind,
  use,
  cardBound,
}: {
  kind: string;
  use: string;
  cardBound: boolean;
}) {
  return (
    <tr className="border-t border-[#e4e4e7]">
      <td className="px-3 py-2 font-mono">{kind}</td>
      <td className="px-3 py-2">{use}</td>
      <td className="px-3 py-2 text-[#52525b]">
        {cardBound ? "✓" : "—"}
      </td>
    </tr>
  );
}

function IxRow({
  name,
  signer,
  body,
}: {
  name: string;
  signer: string;
  body: string;
}) {
  return (
    <tr className="border-t border-[#e4e4e7]">
      <td className="px-3 py-2">{name}</td>
      <td className="px-3 py-2 text-[#52525b]">{signer}</td>
      <td className="px-3 py-2 text-[#52525b]">{body}</td>
    </tr>
  );
}

function PhaseFeature({
  name,
  hook,
  ui,
}: {
  name: string;
  hook: string;
  ui: string;
}) {
  return (
    <div className="rounded-xl border border-[#e4e4e7] bg-[#fafafa] p-3">
      <p className="font-mono text-[11px] text-[#27272a]">{name}</p>
      <p className="mt-1 text-[10px] text-[#52525b]">trigger: {hook}</p>
      <p className="text-[10px] text-[#52525b]">ui: {ui}</p>
    </div>
  );
}

function ParityRow({ layer }: { layer: string }) {
  return (
    <tr className="border-t border-[#e4e4e7]">
      <td className="px-3 py-2">{layer}</td>
      <td className="px-3 py-2 text-emerald-400">✓</td>
      <td className="px-3 py-2 text-emerald-400">✓</td>
      <td className="px-3 py-2 text-emerald-400">✓</td>
    </tr>
  );
}
