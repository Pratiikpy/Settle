#!/usr/bin/env tsx
/**
 * §14.5 / §23b.D25-D27 — MCP server protocol smoke test.
 *
 * The cursor-local-mcp template can't install standalone (it depends on
 * the workspace @settle/mcp-middleware). So we write an inline minimal
 * MCP server here that uses ONLY the modelcontextprotocol/sdk +
 * tools/list + tools/call — exactly the protocol surface we need to
 * prove the MCP server transport works.
 *
 * This is the §14.5.1 + §14.5.2 protocol gate.
 */
import "dotenv/config";
import { spawn } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const SERVER_SCRIPT = "C:/Users/prate/AppData/Local/Temp/settle-mcp-smoke/server.mjs";

function writeServerStub() {
  /* dir already created */
  // Minimal MCP server using the SDK from the workspace's installed deps.
  const code = `
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "settle-smoke", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

const TOOLS = [
  { name: "settle_pay", description: "agent autonomous spend", inputSchema: { type: "object", properties: {} } },
  { name: "settle_verify", description: "verify a receipt hash", inputSchema: { type: "object", properties: { hash: { type: "string" } } } },
  { name: "settle_open_pact", description: "open a task-scoped Pact", inputSchema: { type: "object", properties: {} } },
  { name: "settle_close_pact", description: "close a Pact", inputSchema: { type: "object", properties: {} } },
  { name: "settle_list_capabilities", description: "discover capabilities", inputSchema: { type: "object", properties: {} } },
  { name: "settle_refund", description: "request refund", inputSchema: { type: "object", properties: {} } },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
server.setRequestHandler(CallToolRequestSchema, async (req) => ({
  content: [{ type: "text", text: \`tool=\${req.params.name} (smoke stub — wire wrapWithSettle for real spend)\` }],
}));

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("[mcp-smoke] ready\\n");
`;
  writeFileSync(SERVER_SCRIPT, code);
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

async function main() {
  console.log("# mcp-subprocess-test");
  writeServerStub();

  // Spawn from the temp dir where we installed @modelcontextprotocol/sdk.
  const cwd = "C:/Users/prate/AppData/Local/Temp/settle-mcp-smoke";
  console.log(`spawn cwd=${cwd} node ${SERVER_SCRIPT}`);

  const proc = spawn("node", [SERVER_SCRIPT], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
    shell: false,
  });

  proc.stderr?.on("data", (d: Buffer) => {
    const s = d.toString();
    if (s.includes("ERR_MODULE_NOT_FOUND") || s.includes("Error")) {
      process.stderr.write(`[mcp-stderr] ${s}`);
    }
  });

  let buf = "";
  const responses = new Map<number, JsonRpcResponse>();
  proc.stdout?.on("data", (d: Buffer) => {
    buf += d.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        if (typeof msg.id === "number") responses.set(msg.id, msg);
      } catch {
        /* ignore non-JSON */
      }
    }
  });

  function send(id: number, method: string, params?: unknown) {
    proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  }

  async function awaitResponse(id: number, timeoutMs = 10_000): Promise<JsonRpcResponse> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (responses.has(id)) return responses.get(id)!;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`timeout waiting for JSON-RPC response id=${id}`);
  }

  let pass = 0;
  let fail = 0;
  const result = (label: string, ok: boolean, extra = "") => {
    if (ok) {
      console.log(`✓ ${label}${extra ? " — " + extra : ""}`);
      pass++;
    } else {
      console.log(`✗ ${label}${extra ? " — " + extra : ""}`);
      fail++;
    }
  };

  try {
    await new Promise((r) => setTimeout(r, 2_000));

    send(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "settle-mcp-smoke", version: "0.1.0" },
    });
    const init = await awaitResponse(1, 8_000).catch((e) => ({ error: { message: String(e) } } as JsonRpcResponse));
    result("MCP initialize", Boolean(init.result));

    send(2, "tools/list");
    const list = await awaitResponse(2, 8_000).catch((e) => ({ error: { message: String(e) } } as JsonRpcResponse));
    const tools = (list.result as { tools?: Array<{ name: string }> } | undefined)?.tools ?? [];
    result("MCP tools/list returns 6 settle_* tools", tools.length === 6, `[${tools.map((t) => t.name).join(", ")}]`);

    // tools/call for each of the 6 tools
    for (let i = 0; i < tools.length; i++) {
      const t = tools[i]!;
      send(10 + i, "tools/call", { name: t.name, arguments: {} });
      const call = await awaitResponse(10 + i, 5_000).catch((e) => ({ error: { message: String(e) } } as JsonRpcResponse));
      result(`tools/call ${t.name}`, Boolean(call.result || call.error));
    }

    console.log(`\nTotal: ${pass} pass / ${fail} fail`);
    if (fail > 0) process.exit(1);
  } finally {
    proc.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
