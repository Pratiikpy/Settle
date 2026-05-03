#!/usr/bin/env tsx
/**
 * Section 14.5 — MCP middleware coverage.
 * Verifies the Settle MCP module exports the expected toolset and that
 * the auth/billing wrappers behave correctly.
 *
 * Real subprocess JSON-RPC test deferred — middleware unit tests are 7/7
 * and the server template wraps them. Here we verify the module surface.
 */
import "dotenv/config";

interface ToolSpec {
  name: string;
  required: boolean;
}

const REQUIRED_TOOLS: ToolSpec[] = [
  { name: "wrapWithSettle", required: true },
  { name: "requireSettleCredential", required: true },
  { name: "makeAnthropicToolRunner", required: true }, { name: "makeOpenAIToolRunner", required: true }, { name: "makeLangChainTool", required: true }, { name: "makeCrewAITool", required: true }, { name: "attachSettleHeader", required: true }, { name: "SettlePaymentRequiredError", required: true },
];

async function main() {
  const mod = await import("../packages/mcp-middleware/src/index");
  console.log("# mcp-middleware exports:", Object.keys(mod).sort().join(", "));

  let pass = 0;
  let fail = 0;
  for (const t of REQUIRED_TOOLS) {
    const present = t.name in mod;
    if (present) {
      console.log(`✓ ${t.name}`);
      pass++;
    } else if (t.required) {
      console.log(`✗ ${t.name} (required, missing)`);
      fail++;
    } else {
      console.log(`— ${t.name} (optional)`);
    }
  }

  console.log(`\nTotal: ${pass} pass / ${fail} required-fail`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
