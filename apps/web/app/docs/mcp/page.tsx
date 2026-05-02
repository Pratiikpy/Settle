import type { Metadata } from "next";
import Link from "next/link";
import { W6AppShell } from "../../../components/w6-app-shell";

export const metadata: Metadata = {
  title: "MCP middleware — Settle",
  description:
    "Add Settle to any MCP server in 2 lines. Pay-per-tool, verifiable receipts, no billing logic in your handlers.",
};

export default function McpDocsPage() {
  return (
    <W6AppShell forceSurface="developer">
      <div style={{ maxWidth: 880 }}>
        <div className="text-xs text-foreground/40">Phase 2 · Settle Protocol</div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          MCP middleware
        </h1>
        <p className="mt-2 text-sm text-foreground/60 max-w-xl">
          Drop one wrap call into any MCP server and your tools become
          paid-per-call with verifiable on-chain receipts. Free tools stay
          free; paid tools demand a valid Settle credential before
          delivering output. No billing code in your handlers.
        </p>

        <Section title="Install">
          <pre className="overflow-x-auto rounded-xl bg-black/30 p-4 text-xs text-foreground/80">
            <code>{`pnpm add @settle/mcp-middleware @settle/sdk`}</code>
          </pre>
        </Section>

        <Section title="The 2-line integration">
          <pre className="overflow-x-auto rounded-xl bg-black/30 p-4 text-xs text-foreground/80">
            <code>{`import { wrapWithSettle } from "@settle/mcp-middleware";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server({ name: "translate-demo", version: "0.1.0" });

server.setRequestHandler(
  CallToolRequestSchema,
  wrapWithSettle({
    handler: yourExistingHandler,         // unchanged
    pricing: {
      translate: { amount_lamports: "20000", capability_hash: "<64 hex>" },
    },
    settleEndpoint: "https://settle.so",
    merchantPubkey: "<your-merchant-pubkey>",
  }),
);`}</code>
          </pre>
          <p className="mt-3 text-sm text-foreground/65">
            Tools NOT in the <code>pricing</code> map bypass auth entirely
            (free tools). Tools in the map require a valid credential or
            throw <code>SettlePaymentRequiredError</code>.
          </p>
        </Section>

        <Section title="Capability hash">
          <p>
            Each tool is identified by a 32-byte capability hash. Compute it
            from the canonical spec:
          </p>
          <pre className="overflow-x-auto rounded-xl bg-black/30 p-4 text-xs text-foreground/80">
            <code>{`import { computeCapabilityHashHex } from "@settle/sdk";

const hash = computeCapabilityHashHex({
  domain: "translate.demo.example",
  method: "POST",
  path: "/v1/translate",
  amount_lamports: "20000",
  version: 1,
});`}</code>
          </pre>
          <p className="mt-3 text-sm text-foreground/65">
            Register your hash in the <Link href="/capabilities" className="text-accent hover:underline">capability registry</Link> so users see human aliases ("Translate EN→FR") instead of opaque hex.
          </p>
        </Section>

        <Section title="The credential the agent presents">
          <pre className="overflow-x-auto rounded-xl bg-black/30 p-4 text-xs text-foreground/80">
            <code>{`// Agent runtime puts this on the MCP request _meta:
{
  card_pubkey: "...",         // their Settle AgentCard
  agent_pubkey: "...",        // their agent keypair
  signature_hex: "...",       // signs nonce + envelope
  nonce: "<uuid>",            // replay protection
  expires_at: 1714521600,     // unix seconds
}`}</code>
          </pre>
          <p className="mt-3 text-sm text-foreground/65">
            The middleware reads this from{" "}
            <code>request._meta.settle_credential</code> (string or object).
            Validates expiry, then POSTs to your Settle facilitator at{" "}
            <code>/api/x402/proxy/&lt;merchant&gt;</code> for atomic
            on-chain settlement.
          </p>
        </Section>

        <Section title="Error shape (JSON-RPC)">
          <pre className="overflow-x-auto rounded-xl bg-black/30 p-4 text-xs text-foreground/80">
            <code>{`{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Settle payment required for translate: missing_credential",
    "data": {
      "settle": {
        "reason": "missing_credential" | "denied" | "validation_error",
        "tool_name": "translate",
        "pricing": { "amount_lamports": "20000", "capability_hash": "..." },
        "pay_url": "https://settle.so/agents"
      }
    }
  }
}`}</code>
          </pre>
          <p className="mt-3 text-sm text-foreground/65">
            Settle-aware agent runtimes detect the <code>data.settle</code>{" "}
            envelope, prompt the user to authorize the spend, then retry
            with a credential — same pattern as a Stripe 402.
          </p>
        </Section>

        <Section title="Plain HTTP (no MCP)">
          <p>
            Use <code>requireSettleCredential</code> for any non-MCP HTTP
            endpoint. Same payment gate, no MCP-shaped requests.
          </p>
          <pre className="overflow-x-auto rounded-xl bg-black/30 p-4 text-xs text-foreground/80">
            <code>{`import { requireSettleCredential } from "@settle/mcp-middleware";

const checkPayment = requireSettleCredential({
  pricing: { amount_lamports: "20000", capability_hash: "..." },
  settleEndpoint: "https://settle.so",
  merchantPubkey: "...",
});

// In a Next.js route or Express middleware:
const result = await checkPayment(req.headers);
if (!result.allowed) return res.status(402).json({ reason: result.reason });
// ... continue with the actual handler`}</code>
          </pre>
        </Section>

        <div className="mt-12 flex gap-3">
          <Link
            href="/docs"
            className="inline-flex h-10 items-center rounded-full border border-foreground/20 px-5 text-xs hover:bg-foreground/5"
          >
            ← Docs
          </Link>
          <Link
            href="/docs/webhooks"
            className="inline-flex h-10 items-center rounded-full border border-foreground/20 px-5 text-xs hover:bg-foreground/5"
          >
            Webhooks →
          </Link>
          <Link
            href="/capabilities"
            className="inline-flex h-10 items-center rounded-full border border-foreground/20 px-5 text-xs hover:bg-foreground/5"
          >
            Capability registry →
          </Link>
        </div>
      </div>
    </W6AppShell>
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
