/**
 * Cursor-friendly MCP server with one Settle-gated tool.
 *
 * Speaks MCP over stdio. Cursor (or any MCP-compatible host) launches
 * this process and pipes JSON-RPC. The `wrapWithSettle` middleware turns
 * the tool into a paid endpoint without requiring any cloud deploy —
 * validation still routes through settle.so so receipts land on-chain.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { wrapWithSettle } from "@settle/mcp-middleware";

const server = new Server(
  { name: "settle-demo", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "translate",
      description: "Translate text EN→FR. Costs ~$0.01 per call (paid via Settle).",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
    },
  ],
}));

const handler = wrapWithSettle({
  handler: async (req) => {
    const text = String(req.params.arguments?.text ?? "");
    return {
      content: [
        { type: "text", text: `[fr] ${text}` },
      ],
    };
  },
  pricing: {
    translate: {
      capability_hash: process.env.SETTLE_DEMO_CAPABILITY_HASH ?? "",
      amount_lamports: process.env.SETTLE_DEMO_AMOUNT_LAMPORTS ?? "10000",
    },
  },
  settleEndpoint: process.env.SETTLE_ENDPOINT ?? "https://settle.so",
  merchantPubkey: process.env.MERCHANT_PUBKEY ?? "",
});

server.setRequestHandler(CallToolRequestSchema, handler);

const transport = new StdioServerTransport();
await server.connect(transport);
