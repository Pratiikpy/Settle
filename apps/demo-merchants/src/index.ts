import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { config } from "dotenv";

config();

/**
 * Demo merchants for the 90-second flow:
 *   - ArxivFetch  → /arxiv-fetch  ($0.10)
 *   - TranslateAPI → /translate    ($0.30)
 *   - SummaryLLM  → /summarize    ($0.05)
 *
 * Each endpoint enforces the x402 Payment Required pattern:
 *   - First call without X-Settle-Credential → 402 with payment_required header
 *   - Repeat call with valid credential + agent_sig → 200 with deliverable JSON
 *
 * In production this would integrate with the Settle facilitator that builds the spend ix
 * on the agent's behalf. For demo we trust headers if a credential exists (the facilitator
 * handles the heavy verification on the proxy path).
 */

const app = new Hono();
app.use("*", logger());
app.use("*", cors({ origin: "*" }));

const REQUIRES_PAYMENT_HEADER = (amount: string, capability: string) => ({
  "X-402-Required": "settle",
  "X-402-Amount-Lamports": amount,
  "X-402-Capability-Hash": capability,
});

app.get("/", (c) =>
  c.json({
    name: "Settle Demo Merchants",
    endpoints: ["/arxiv-fetch", "/translate", "/summarize"],
  }),
);

app.post("/arxiv-fetch", async (c) => {
  const cred = c.req.header("x-settle-credential");
  if (!cred) {
    return c.json(
      { error: "payment_required", price_usdc: "0.10" },
      402,
      REQUIRES_PAYMENT_HEADER("100000", "a".repeat(64)),
    );
  }
  const body = await c.req.json().catch(() => ({}));
  const paperId = body.paper_id ?? "unknown";

  return c.json({
    ok: true,
    merchant: "ArxivFetch",
    deliverable: {
      paper_id: paperId,
      title: "Quantum decoherence and the emergence of classical physics",
      abstract:
        "We study quantum-to-classical transitions in many-body systems, demonstrating that decoherence rates scale exponentially with system size in the deep quantum regime…",
      pages: 18,
      lang_detected: "ja",
      content_url: "ipfs://demo-paper-jp",
    },
    receipt_hash: cryptoRandomHex(64),
  });
});

app.post("/translate", async (c) => {
  const cred = c.req.header("x-settle-credential");
  if (!cred) {
    return c.json(
      { error: "payment_required", price_usdc: "0.30" },
      402,
      REQUIRES_PAYMENT_HEADER("300000", "b".repeat(64)),
    );
  }
  const body = await c.req.json().catch(() => ({}));

  return c.json({
    ok: true,
    merchant: "TranslateAPI",
    deliverable: {
      source_lang: body.source ?? "ja",
      target_lang: body.target ?? "en",
      pages_translated: 18,
      excerpt:
        "Quantum decoherence describes the loss of quantum coherence due to interaction with the environment. In macroscopic systems this transition produces what we observe as classical behavior…",
    },
    receipt_hash: cryptoRandomHex(64),
  });
});

app.post("/summarize", async (c) => {
  const cred = c.req.header("x-settle-credential");
  if (!cred) {
    return c.json(
      { error: "payment_required", price_usdc: "0.05" },
      402,
      REQUIRES_PAYMENT_HEADER("50000", "c".repeat(64)),
    );
  }
  const body = await c.req.json().catch(() => ({}));

  return c.json({
    ok: true,
    merchant: "SummaryLLM",
    deliverable: {
      audience: body.audience ?? "eli12",
      summary:
        "Imagine a coin spinning on a table. While it's spinning fast, you can't tell which side will land up. But as soon as it touches the table and slows, gravity pulls one side down — that's a 'classical' result. Quantum decoherence is the math version of touching the table: tiny interactions with the environment force fuzzy quantum states to pick a definite answer.",
      word_count: 73,
    },
    receipt_hash: cryptoRandomHex(64),
  });
});

function cryptoRandomHex(chars: number): string {
  const bytes = new Uint8Array(chars / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const PORT = Number(process.env.PORT ?? "8788");
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Demo merchants listening on http://localhost:${PORT}`);
  console.log("  POST /arxiv-fetch  ($0.10)");
  console.log("  POST /translate    ($0.30)");
  console.log("  POST /summarize    ($0.05)");
});
