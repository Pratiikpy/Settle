import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "../../components/footer";

export const metadata: Metadata = {
  title: "Docs — Settle",
  description: "How to integrate Settle: SDK, webhooks, agent credentials, hash-committed receipts.",
};

export default function DocsPage() {
  return (
    <>
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight">Docs</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Settle is open-source. The SDK is MIT-licensed. Use the bits you need.
        </p>

        <Section title="Install">
          <pre className="block rounded-xl bg-black/30 p-4 text-xs text-foreground/80">
            <code>{`pnpm add @settle/sdk`}</code>
          </pre>
          <p>
            Until npm publish, use the monorepo workspace dependency:{" "}
            <code>&quot;@settle/sdk&quot;: &quot;workspace:*&quot;</code>.
          </p>
        </Section>

        <Section title="Verify a receipt">
          <pre className="block rounded-xl bg-black/30 p-4 text-xs text-foreground/80">
            <code>{`import { verifyReceipt } from "@settle/sdk";

const result = verifyReceipt({
  receipt: { request_id, card_pubkey, merchant_pubkey, amount_lamports, capability_hash, purpose_text_hash, decision_slot, policy_version },
  reason: { decision, deny_code, ... },
  policy_snapshot: { policy_version, daily_cap, ... },
  http: { method: "POST", path: "/api/translate" },
  expected: { receipt_hash, reason_hash, policy_snapshot_hash, purpose_hash },
});

if (result.ok) console.log("authentic.");`}</code>
          </pre>
          <p>
            Recomputes the four BLAKE3 hashes and compares them against the on-chain commits.
            If a single byte of the receipt has been altered, <code>result.ok</code> is false.
          </p>
        </Section>

        <Section title="Verify a webhook">
          <pre className="block rounded-xl bg-black/30 p-4 text-xs text-foreground/80">
            <code>{`import { verifyWebhookSignature } from "@settle/sdk";

const ok = verifyWebhookSignature({
  bodyBytes: Buffer.from(rawBody),
  signatureHex: req.header("X-Settle-Signature"),
  secret: process.env.SETTLE_WEBHOOK_SECRET,
});`}</code>
          </pre>
          <p>HMAC-SHA256, constant-time comparison, version pinned in the SDK.</p>
        </Section>

        <Section title="Endpoints">
          <p className="text-foreground/55">
            Selected — full list registered at build time. Most build endpoints return an
            unsigned base64 tx for the caller&apos;s wallet to sign.
          </p>
          <ul>
            <li><code>POST /api/x402/proxy/[merchant]</code> — payment-required gateway with on-chain spend (dual-sig + live policy check + Helius Sender)</li>
            <li><code>POST /api/agents/create-card</code> — build an unsigned <code>create_card</code> ix</li>
            <li><code>POST /api/agents/spawn</code> — build an unsigned <code>open_pact</code> ix</li>
            <li><code>POST /api/cards/[id]/revoke</code> — build an unsigned <code>revoke</code> or <code>close_pact</code> ix</li>
            <li><code>POST /api/streaming-pacts/open</code> — build <code>open_streaming_pact</code></li>
            <li><code>POST /api/streaming-pacts/[id]/{`{claim,pause,resume}`}</code> — claim / pause / resume a streaming pact</li>
            <li><code>POST /api/escrows/open</code> — build <code>open_delivery_escrow</code></li>
            <li><code>POST /api/escrows/[id]/{`{release,dispute}`}</code> — release or dispute an escrow</li>
            <li><code>POST /api/swap/quote-and-build</code> — Pay-with-any-token (USDC direct or Jupiter swap composed in v0 versioned tx)</li>
            <li><code>POST /api/send/build</code> — Solana Pay USDC transfer with reference</li>
            <li><code>POST /api/send/link/build</code> — escrow-based &quot;send to anyone&quot; link</li>
            <li><code>POST /api/payment-links</code>, <code>POST /api/payment-links/[token]</code> — one-time-use links</li>
            <li><code>GET /api/sp/[merchant]/[slug]</code> — Solana Pay transaction-request endpoint for self-repricing QR</li>
            <li><code>POST /api/collabs</code>, <code>POST /api/collabs/[id]/pay</code> — atomic 2-creator split tx</li>
            <li><code>POST /api/split-bills</code>, <code>POST /api/split-bills/[id]/{`{pay,confirm}`}</code> — server-aggregated N-payer bill</li>
            <li><code>GET /api/feed</code> — public-feed-flagged receipts (decisions only, no purpose)</li>
            <li><code>GET /api/handles/[handle]/profile</code> — public profile + earnings block (F18)</li>
            <li><code>GET /api/handles/[handle]/relationship</code> — wallet-aware "you've sent $X" (F15)</li>
            <li><code>GET /api/handles/[handle]/badges</code> — soulbound MPL Core badges minted to this user</li>
            <li><code>POST /api/follows/[handle]</code>, <code>GET /api/follows/[handle]/stats</code> — follow graph (F16)</li>
            <li><code>GET /api/leaderboard</code>, <code>GET /api/leaderboard/[capabilityHash]</code> — capability leaderboard (F17)</li>
            <li><code>POST /api/receipts/[requestId]/refund</code> — mode-routed refund (close_pact / dispute_delivery_escrow)</li>
            <li><code>GET/POST /api/actions/router/[handle]/[type]</code> — Universal Blink router (Solana Actions spec)</li>
          </ul>
        </Section>

        <Section title="Anchor program">
          <p>
            <strong>Program:</strong> <code>settle-agent-card</code> (Anchor 0.31). Two account
            types: <code>AgentCard</code> + <code>Pact</code>. The <code>Pact.mode</code> field
            is a tagged enum with three variants: <code>OneShot</code>,{" "}
            <code>Streaming</code>, <code>DeliveryEscrow</code>.
          </p>
          <p>
            <strong>14 instructions:</strong>
          </p>
          <ul>
            <li>
              <strong>v0.2 core:</strong> <code>create_card</code>, <code>spend</code>,{" "}
              <code>spend_via_pact</code>, <code>revoke</code>,{" "}
              <code>record_denial</code>, <code>open_pact</code>, <code>close_pact</code>
            </li>
            <li>
              <strong>v0.3 streaming pact (P1):</strong>{" "}
              <code>open_streaming_pact</code>, <code>claim_streaming</code>,{" "}
              <code>pause_streaming</code>, <code>resume_streaming</code>
            </li>
            <li>
              <strong>v0.3 delivery escrow (P9):</strong>{" "}
              <code>open_delivery_escrow</code>, <code>release_delivery_escrow</code>{" "}
              (dual-caller: buyer any time / anyone after deadline),{" "}
              <code>dispute_delivery_escrow</code>
            </li>
          </ul>
          <p>
            Program ID is patched into env after <code>pnpm deploy:devnet</code>. Until then,{" "}
            client-side ix builders fail loudly with{" "}
            <code>SETTLE_AGENT_CARD_PROGRAM_ID is still the placeholder…</code>.
          </p>
          <p>
            Source of truth: <code>programs/settle-agent-card/programs/settle-agent-card/src/</code>.
            IDL mirror: <code>packages/sdk/src/idl.ts</code>.
          </p>
        </Section>

        <Section title="On-chain events">
          <p>
            All decoded by{" "}
            <code>apps/indexer/src/index.ts</code> via 8-byte sighash discriminators
            (<code>sha256(&quot;event:&lt;Name&gt;&quot;)[..8]</code>) and mirrored to Postgres.
          </p>
          <ul>
            <li>
              <code>PolicyDecisionEvent</code> — every spend / claim / record_denial / revoke; carries the 4-hash receipt commitment chain
            </li>
            <li>
              <code>CardCreatedEvent</code>, <code>CardRevokedEvent</code>
            </li>
            <li>
              <code>PactOpenedEvent</code>, <code>PactClosedEvent</code>, <code>PactSpendEvent</code>
            </li>
            <li>
              <code>StreamingPactOpenedEvent</code>, <code>PactStreamClaimEvent</code>, <code>PactStreamPauseEvent</code>
            </li>
            <li>
              <code>DeliveryEscrowOpenedEvent</code>, <code>DeliveryEscrowReleasedEvent</code>{" "}
              (carries <code>is_buyer_confirmed</code> flag), <code>DeliveryEscrowDisputedEvent</code>
            </li>
          </ul>
        </Section>

        <Section title="Reputation badges (soulbound)">
          <p>
            Six on-chain achievements minted as MPL Core assets with the{" "}
            <code>PermanentFreezeDelegate</code> plugin (frozen at create time —
            non-transferable, non-burnable, true SBT semantics). The badge-cron
            worker (<code>apps/indexer/src/badge-cron.ts</code>) polls Postgres
            every 5 minutes; when a user crosses a threshold, an asset is created
            and a row inserted into <code>reputation_badges</code>. The cron is
            idempotent via a unique <code>(user_pubkey, badge_kind)</code> constraint.
          </p>
          <ul>
            <li>
              <strong>🏁 First Payer</strong> — first ALLOW receipt to any merchant.
            </li>
            <li>
              <strong>🧠 Polymath</strong> — paid 5+ distinct capability hashes.
            </li>
            <li>
              <strong>⚡ High-Frequency Operator</strong> — 100+ ALLOW receipts lifetime.
            </li>
            <li>
              <strong>🌊 Long Streamer</strong> — active streaming pact for 30+ days.
            </li>
            <li>
              <strong>⚖ Honest Disputer</strong> — first successful{" "}
              <code>dispute_delivery_escrow</code> within window.
            </li>
            <li>
              <strong>📡 Public Spender</strong> — first <code>public_feed=true</code> receipt.
            </li>
          </ul>
          <p>
            Catalogue source: <code>packages/types/src/badges.ts</code> (single
            source of truth — both UI and cron import from here, so no MPL Core
            dep in the SDK / browser bundle).
          </p>
        </Section>

        <Section title="More">
          <ul>
            <li>
              <Link href="/security" className="text-accent">
                Security model
              </Link>
            </li>
            <li>
              <Link href="/public-goods" className="text-accent">
                Public goods commitment
              </Link>
            </li>
            <li>
              <Link href="/help" className="text-accent">
                FAQ
              </Link>
            </li>
            <li>
              See also{" "}
              <a
                href="https://github.com/Pratiikpy/settle-protocol/blob/main/docs/PRODUCT_SPEC.md"
                target="_blank"
                rel="noreferrer"
                className="text-accent"
              >
                docs/PRODUCT_SPEC.md
              </a>{" "}
              for the canonical IS / IS-NOT spec per feature.
            </li>
          </ul>
        </Section>
      </main>
      <Footer />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-medium">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-foreground/75 [&_code]:rounded [&_code]:bg-foreground/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-xs [&_li]:list-disc [&_ul]:ml-6 [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
