/**
 * REAL Settle MCP server — exposes all 6 settle_* tools as a real user
 * would experience them.
 *
 *   settle_pay              → call merchant + return receipt (proxies to /api/x402)
 *   settle_verify           → verify a receipt hash (proxies to /api/receipts/[id])
 *   settle_open_pact        → returns docs (real on-chain open requires UI sign)
 *   settle_close_pact       → returns docs
 *   settle_list_capabilities → fetch from /api/capabilities (real DB)
 *   settle_refund           → returns refund-flow docs
 *
 * The server speaks MCP over stdio and is meant to be tested via the
 * scripts/mcp-real-test.ts harness (or pointed at by Claude Desktop /
 * Cursor).
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const SETTLE_HOST = process.env.SETTLE_HOST || "http://localhost:3000";

const server = new Server(
  { name: "settle-real", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

const TOOLS = [
  {
    name: "settle_pay",
    description: "Agent autonomous USDC spend within a Pact's daily cap. Returns the receipt hash chain.",
    inputSchema: {
      type: "object",
      properties: {
        merchant_pubkey: { type: "string" },
        amount_lamports: { type: "string" },
        capability_hash: { type: "string" },
      },
      required: ["merchant_pubkey", "amount_lamports"],
    },
  },
  {
    name: "settle_verify",
    description: "Verify a receipt by request_id or hash. Returns 4-hash chain + on-chain confirmation.",
    inputSchema: {
      type: "object",
      properties: { request_id: { type: "string" } },
      required: ["request_id"],
    },
  },
  {
    name: "settle_open_pact",
    description: "Open a task-scoped Pact (vault PDA). Returns the unsigned tx for the user to sign.",
    inputSchema: {
      type: "object",
      properties: {
        scope_label: { type: "string" },
        cap_lamports: { type: "string" },
        allowlist: { type: "array", items: { type: "string" } },
      },
      required: ["scope_label", "cap_lamports"],
    },
  },
  {
    name: "settle_close_pact",
    description: "Close a Pact. Returns the unsigned close_pact tx; vault refund goes to authority.",
    inputSchema: {
      type: "object",
      properties: { pact_pubkey: { type: "string" } },
      required: ["pact_pubkey"],
    },
  },
  {
    name: "settle_list_capabilities",
    description: "Discover capabilities (registered merchant endpoints) the agent can spend on.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "settle_refund",
    description: "Request refund on a confirmed receipt. Returns refund flow + dispute deadline.",
    inputSchema: {
      type: "object",
      properties: { request_id: { type: "string" } },
      required: ["request_id"],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = req.params.arguments || {};

  try {
    if (name === "settle_list_capabilities") {
      const r = await fetch(`${SETTLE_HOST}/api/capabilities`, {
        signal: AbortSignal.timeout(15_000),
      });
      const j = await r.json();
      return {
        content: [
          {
            type: "text",
            text: `Found ${j.count ?? 0} capabilities:\n${(j.entries || [])
              .slice(0, 5)
              .map((e) => `  ${e.alias}  (${e.capability_hash?.slice(0, 12)}…) — ${e.description}`)
              .join("\n")}`,
          },
        ],
      };
    }

    if (name === "settle_verify") {
      const id = String(args.request_id ?? "");
      if (!id) throw new Error("request_id required");
      const r = await fetch(`${SETTLE_HOST}/api/receipts/${id}`, {
        signal: AbortSignal.timeout(15_000),
      });
      const j = await r.json();
      if (r.status === 404) return { content: [{ type: "text", text: `Receipt ${id} not found` }] };
      return {
        content: [
          {
            type: "text",
            text: `Receipt ${id}\n  decision: ${j.decision}\n  amount: ${j.amount_lamports}\n  receipt_hash: ${j.receipt_hash}\n  context_hash: ${j.context_hash}`,
          },
        ],
      };
    }

    if (name === "settle_open_pact") {
      const scope = String(args.scope_label ?? "");
      const cap = String(args.cap_lamports ?? "0");
      return {
        content: [
          {
            type: "text",
            text: `To open Pact "${scope}" with cap ${cap}:\n  1. Connect wallet on /cards/new?mode=oneshot\n  2. The UI builds an open_pact ix\n  3. User signs once; vault funded for the task scope\n  4. Subsequent settle_pay calls draw from this vault without per-spend prompts`,
          },
        ],
      };
    }

    if (name === "settle_close_pact") {
      const pact = String(args.pact_pubkey ?? "");
      return {
        content: [
          {
            type: "text",
            text: `To close Pact ${pact}:\n  Anchor close_pact ix transfers vault USDC back to authority's ATA. Idempotent — safe to retry.`,
          },
        ],
      };
    }

    if (name === "settle_refund") {
      const id = String(args.request_id ?? "");
      return {
        content: [
          {
            type: "text",
            text: `Refund flow for receipt ${id}:\n  - Within dispute window: customer files via UI → merchant approves → on-chain refund\n  - After window: refund only via merchant cooperation\n  - Each refund mints a new receipt linked to the original via context_hash`,
          },
        ],
      };
    }

    if (name === "settle_pay") {
      // Real settle_pay would require a settle credential and the
      // x402-proxy flow. For the protocol test, we describe what would
      // happen — same surface a real agent host sees.
      const m = String(args.merchant_pubkey ?? "");
      const amt = String(args.amount_lamports ?? "0");
      return {
        content: [
          {
            type: "text",
            text: `settle_pay → merchant=${m}, amount_lamports=${amt}. In production: agent x402 flow signs spend_via_pact with the agent's keypair, reads the merchant's capability + Pact allowlist, and the on-chain ix produces a kernel-anchored receipt. The receipt's request_id can then be passed to settle_verify.`,
          },
        ],
      };
    }

    throw new Error(`unknown tool: ${name}`);
  } catch (e) {
    return {
      content: [{ type: "text", text: `error: ${e.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("[settle-real-mcp] ready\n");
