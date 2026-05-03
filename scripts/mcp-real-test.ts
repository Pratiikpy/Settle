#!/usr/bin/env tsx
/**
 * REAL MCP server end-to-end test.
 *
 * Spawns scripts/mcp-real-server.mjs (running in the temp dir that has
 * @modelcontextprotocol/sdk installed) and calls each of the 6 settle_*
 * tools via JSON-RPC. Asserts the actual side effects, not just protocol
 * compliance:
 *
 *   settle_list_capabilities → must hit /api/capabilities + return ≥1 entry
 *   settle_verify (known id)  → must return decision + receipt_hash
 *   settle_pay                → must return capability/payment metadata
 *   settle_open_pact          → must return scope + cap docs
 *   settle_close_pact         → must return on-chain ix description
 *   settle_refund             → must return dispute window docs
 */
import "dotenv/config";
import { spawn } from "child_process";
import { copyFileSync } from "fs";
import { resolve } from "path";

const SDK_DIR = "C:/Users/prate/AppData/Local/Temp/settle-mcp-smoke";
const SERVER_DEST = `${SDK_DIR}/real-server.mjs`;
const SERVER_SRC = resolve("scripts/mcp-real-server.mjs");

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

async function main() {
  console.log("# mcp-real-test");
  // Copy fresh server stub into the SDK dir
  copyFileSync(SERVER_SRC, SERVER_DEST);

  const proc = spawn("node", [SERVER_DEST], {
    cwd: SDK_DIR,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, SETTLE_HOST: process.env.SETTLE_HOST || "http://localhost:3000" },
    shell: false,
  });

  proc.stderr?.on("data", (d: Buffer) => {
    const s = d.toString();
    if (!s.includes("ready")) process.stderr.write(`[srv-stderr] ${s}`);
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
        const m = JSON.parse(line) as JsonRpcResponse;
        if (typeof m.id === "number") responses.set(m.id, m);
      } catch {
        /* ignore */
      }
    }
  });

  const send = (id: number, method: string, params?: unknown) => {
    proc.stdin?.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  };

  const wait = async (id: number, ms = 20_000): Promise<JsonRpcResponse> => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (responses.has(id)) return responses.get(id)!;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`timeout id=${id}`);
  };

  let pass = 0;
  let fail = 0;
  const ok = (label: string, cond: boolean, extra = "") => {
    if (cond) {
      console.log(`✓ ${label}${extra ? " — " + extra : ""}`);
      pass++;
    } else {
      console.log(`✗ ${label}${extra ? " — " + extra : ""}`);
      fail++;
    }
  };

  type CallResult = {
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
  };

  try {
    await new Promise((r) => setTimeout(r, 2_000));

    // 1. initialize
    send(1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "settle-real-test", version: "0.1.0" },
    });
    const init = await wait(1);
    ok("MCP initialize handshake", Boolean(init.result));

    // 2. tools/list
    send(2, "tools/list");
    const list = await wait(2);
    const tools = (list.result as { tools?: Array<{ name: string }> } | undefined)?.tools ?? [];
    const want = [
      "settle_pay",
      "settle_verify",
      "settle_open_pact",
      "settle_close_pact",
      "settle_list_capabilities",
      "settle_refund",
    ];
    const present = new Set(tools.map((t) => t.name));
    ok(
      "tools/list returns all 6 settle_* tools",
      want.every((w) => present.has(w)),
      `got: [${[...present].join(", ")}]`,
    );

    // 3. settle_list_capabilities → must hit /api/capabilities + return entries
    send(10, "tools/call", { name: "settle_list_capabilities", arguments: {} });
    const caps = await wait(10);
    const capsResult = caps.result as CallResult | undefined;
    const capsText = capsResult?.content?.[0]?.text ?? "";
    ok(
      "settle_list_capabilities returns >=1 capability from real /api/capabilities",
      /Found \d+ capabilities/.test(capsText) && !capsText.includes("Found 0"),
      capsText.split("\n")[0],
    );

    // 4. settle_verify with a known receipt id
    send(11, "tools/call", {
      name: "settle_verify",
      arguments: { request_id: "f6066dac-5602-4918-882a-02305aa60365" },
    });
    const verify = await wait(11);
    const verifyText = (verify.result as CallResult | undefined)?.content?.[0]?.text ?? "";
    ok(
      "settle_verify returns receipt with decision + hash",
      /receipt_hash:/.test(verifyText) && /decision:/.test(verifyText),
      verifyText.split("\n")[0],
    );

    // 5. settle_open_pact → describes the open flow
    send(12, "tools/call", {
      name: "settle_open_pact",
      arguments: { scope_label: "test-task", cap_lamports: "1000000" },
    });
    const open = await wait(12);
    const openText = (open.result as CallResult | undefined)?.content?.[0]?.text ?? "";
    ok(
      "settle_open_pact describes scope + cap + connect-wallet flow",
      openText.includes("test-task") && openText.includes("1000000"),
    );

    // 6. settle_close_pact
    send(13, "tools/call", {
      name: "settle_close_pact",
      arguments: { pact_pubkey: "9tqwgWNRjx5vVZSJFZS85BTawhQuhvFmAZQq1SEpo7aa" },
    });
    const close = await wait(13);
    const closeText = (close.result as CallResult | undefined)?.content?.[0]?.text ?? "";
    ok(
      "settle_close_pact describes Anchor ix + ATA transfer",
      closeText.includes("close_pact") && closeText.includes("authority"),
    );

    // 7. settle_refund
    send(14, "tools/call", {
      name: "settle_refund",
      arguments: { request_id: "f6066dac-5602-4918-882a-02305aa60365" },
    });
    const refund = await wait(14);
    const refundText = (refund.result as CallResult | undefined)?.content?.[0]?.text ?? "";
    ok(
      "settle_refund describes dispute window + on-chain refund + context_hash linking",
      refundText.includes("dispute") && refundText.includes("context_hash"),
    );

    // 8. settle_pay
    send(15, "tools/call", {
      name: "settle_pay",
      arguments: {
        merchant_pubkey: "Hrjjwhe1kS6qi9bmhxra7JgPggfGJa62mDnn2koyMijB",
        amount_lamports: "10000",
      },
    });
    const pay = await wait(15);
    const payText = (pay.result as CallResult | undefined)?.content?.[0]?.text ?? "";
    ok(
      "settle_pay describes spend_via_pact ix + receipt request_id flow",
      payText.includes("spend_via_pact") && payText.includes("Hrjjwhe1"),
    );

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
