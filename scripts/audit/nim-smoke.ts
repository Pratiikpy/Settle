#!/usr/bin/env tsx
/**
 * Wave 0 NVIDIA NIM smoke test. Calls nimChat with a tiny prompt
 * and asserts the response shape. If this fails, no Wave 1+ feature
 * relying on NIM should proceed — fail loud now, not mid-implementation.
 */
import { nimChat, nimAvailable, NIM_DEFAULT_MODEL } from "../../apps/web/lib/nvidia-nim";

async function main() {
  console.log("=".repeat(60));
  console.log("Wave 0 — NVIDIA NIM smoke test");
  console.log("=".repeat(60));
  console.log(`Default model: ${NIM_DEFAULT_MODEL}`);
  console.log(`API key set: ${nimAvailable() ? "yes" : "NO — fix env first"}`);
  if (!nimAvailable()) process.exit(2);

  const t0 = Date.now();
  try {
    const reply = await nimChat({
      messages: [
        {
          role: "system",
          content:
            "You are a terse smoke-test assistant. Reply in exactly 5 words.",
        },
        { role: "user", content: "Say the smoke test passed." },
      ],
      temperature: 0,
      max_tokens: 50,
      timeoutMs: 90_000,
      model: "meta/llama-3.3-70b-instruct",
    });
    const elapsed = Date.now() - t0;
    console.log(`Reply (${elapsed}ms): "${reply.text.trim()}"`);
    if (reply.usage) {
      console.log(
        `Tokens: prompt=${reply.usage.prompt_tokens ?? "?"} completion=${reply.usage.completion_tokens ?? "?"} total=${reply.usage.total_tokens ?? "?"}`,
      );
    }
    if (!reply.text.trim()) {
      console.error("FAIL: empty reply text");
      process.exit(1);
    }
    console.log("✓ NIM endpoint reachable + returning content");
    process.exit(0);
  } catch (e) {
    console.error("FAIL:", (e as Error).message);
    process.exit(1);
  }
}

void main();
