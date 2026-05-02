/**
 * Settle merchant — Replit-friendly Express server.
 *
 * One paid endpoint at POST /summarize. Replit's web view exposes
 * the live URL; users hit it with X-Settle-Credential to spend.
 */
import express from "express";
import { requireSettleCredential } from "@settle/mcp-middleware";

const app = express();
app.use(express.json({ limit: "1mb" }));

const check = requireSettleCredential({
  pricing: {
    capability_hash: process.env.SETTLE_DEMO_CAPABILITY_HASH ?? "",
    amount_lamports: process.env.SETTLE_DEMO_AMOUNT_LAMPORTS ?? "10000",
  },
  settleEndpoint: process.env.SETTLE_ENDPOINT ?? "https://settle.so",
  merchantPubkey: process.env.MERCHANT_PUBKEY ?? "",
});

app.post("/summarize", async (req, res) => {
  const result = await check(req.headers as Record<string, string | string[] | undefined>);
  if (!result.allowed) {
    res.status(402).json({
      error: "payment_required",
      settle: {
        reason: result.reason,
        pay_url: `${process.env.SETTLE_ENDPOINT ?? "https://settle.so"}/agents`,
      },
    });
    return;
  }
  const text = (req.body as { text?: string }).text ?? "";
  const summary = text.length > 200 ? `${text.slice(0, 197)}…` : text;
  res.json({
    summary,
    receipt_request_id: result.receipt_request_id ?? null,
  });
});

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    merchant: process.env.MERCHANT_PUBKEY ?? "<unset>",
  });
});

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`settle merchant listening on :${PORT}`);
});
