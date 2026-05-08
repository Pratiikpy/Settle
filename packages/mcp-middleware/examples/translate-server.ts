/**
 * Example: a minimal Settle-aware MCP server with one paid tool
 * (translate) and one free tool (ping).
 *
 * This file is intentionally a SINGLE FILE so a developer can copy/paste
 * it into their own project and adapt. Replace the `// MCP SDK` block
 * with the real Anthropic MCP SDK setup (Server + StdioServerTransport).
 *
 * Run conceptually:
 *   cd packages/mcp-middleware
 *   pnpm exec tsx examples/translate-server.ts
 *
 * What you should see:
 *   - "ping" tool returns "pong" with no auth
 *   - "translate" tool requires a Settle credential header
 *   - Without credential → SettlePaymentRequiredError
 *   - With valid credential → translation runs, USDC moves, receipt appears
 */

import {
  wrapWithSettle,
  SettlePaymentRequiredError,
  type McpToolRequest,
  type McpToolResponse,
} from "../src/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Your tool handlers — written EXACTLY as you'd write them without Settle.
// ─────────────────────────────────────────────────────────────────────────────

async function rawHandler(request: McpToolRequest): Promise<McpToolResponse> {
  const name = request.params.name;
  const args = request.params.arguments ?? {};

  if (name === "ping") {
    return { content: [{ type: "text", text: "pong" }] };
  }

  if (name === "translate") {
    const text = String(args.text ?? "");
    const target = String(args.target_lang ?? "fr");
    // (Real impl: call your translation backend here.)
    const fake = `[${target}] ${text}`;
    return { content: [{ type: "text", text: fake }] };
  }

  return {
    content: [{ type: "text", text: `unknown tool: ${name}` }],
    isError: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Wrap with Settle. Add tool names + pricing here. Free tools are NOT
//    in the pricing map and bypass the auth check entirely.
// ─────────────────────────────────────────────────────────────────────────────

const handler = wrapWithSettle({
  handler: rawHandler,
  // Capability hashes computed by computeCapabilityHashHex from @settle/sdk
  // (or inspect the seeds in scripts/seed-capabilities.ts).
  pricing: {
    translate: {
      amount_lamports: "20000", // $0.02 USDC (6 decimals)
      // Matches the seeded entry in /api/capabilities (verified=true). Spec:
      // domain="translate.demo.settle", method=POST, path="/v1/translate",
      // amount_lamports="20000", version=1.
      capability_hash:
        "a6c909df4e32976e67abd01927fea3796ec0170b8c1e0f1c708139da7964105b",
      description: "Translate EN→<target_lang>",
    },
    // 'ping' is NOT here — it's free.
  },
  settleEndpoint:
    process.env.SETTLE_ENDPOINT ?? "https://settle.so",
  merchantPubkey:
    process.env.SETTLE_MERCHANT_PUBKEY ??
    "<your-merchant-pubkey-here>",
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. MCP SDK plumbing. Replace the demo loop below with the real SDK:
//
//   import { Server } from "@modelcontextprotocol/sdk/server/index.js";
//   import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
//   import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
//
//   const server = new Server({ name: "translate-demo", version: "0.1.0" });
//   server.setRequestHandler(CallToolRequestSchema, handler);
//   await server.connect(new StdioServerTransport());
// ─────────────────────────────────────────────────────────────────────────────

async function demo() {
  console.log("=== ping (free) ===");
  console.log(await handler({ params: { name: "ping" } }));

  console.log("\n=== translate WITHOUT credential ===");
  try {
    await handler({
      params: { name: "translate", arguments: { text: "hello", target_lang: "fr" } },
    });
  } catch (e) {
    if (e instanceof SettlePaymentRequiredError) {
      console.log("  ✗ Payment required:", e.data.settle);
    } else {
      throw e;
    }
  }

  console.log(
    "\n(With a valid Settle credential in request._meta.settle_credential, the translate tool would run.)",
  );
}

if (process.argv[1]?.endsWith("translate-server.ts")) {
  demo().catch(console.error);
}
